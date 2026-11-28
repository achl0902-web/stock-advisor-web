import test from "node:test";
import assert from "node:assert/strict";
import { BoardDatafeed, buildRegistry } from "../src/board-datafeed.js";

const days = count => Array.from({ length: count }, (_, i) =>
  new Date(Date.UTC(2024, 0, 1) + i * 86400000).toISOString().slice(0, 10));
const rows = (dates, base = 0) => ({
  t: dates,
  o: dates.map((_, i) => i + base),
  h: dates.map((_, i) => i + base),
  l: dates.map((_, i) => i + base),
  c: dates.map((_, i) => i + base),
  v: dates.map(() => 1),
});
const sym = { sym: "QLD", col: "bars", doc: "QLD", country: "US", kind: "watch" };

test("60분봉은 별도 파일을 우선하고 큰 일봉 파일을 내려받지 않는다", async () => {
  const calls = [];
  const feed = new BoardDatafeed(async (col, doc) => {
    calls.push(col + "/" + doc);
    return col === "hourly"
      ? { sym: "QLD", h: rows([1000, 2000, 3000]) }
      : { sym: "QLD", d: rows(days(1000)), h: rows([500]) };
  });
  assert.equal((await feed.bars(sym, "60")).length, 3);
  assert.equal((await feed.bars(sym, "60")).length, 3);
  assert.deepEqual(calls, ["hourly/QLD"]);
});

test("새 시간봉 파일이 없거나 다른 종목이면 기존 bars.h로 되돌아간다", async () => {
  const feed = new BoardDatafeed(async col => col === "bars"
    ? { sym: "QLD", d: rows(days(3)), h: rows([1000, 2000]) }
    : { sym: "WRONG", h: rows([1000, 2000, 3000]) });
  assert.equal((await feed.bars(sym, "60")).length, 2);
});

test("같은 주기의 변환 봉을 재사용하고 새 수집 시에는 갱신한다", async () => {
  let reads = 0;
  const feed = new BoardDatafeed(async () => {
    reads++;
    return { d: rows(days(4)) };
  });
  const first = await feed.bars(sym, "1W");
  const second = await feed.bars(sym, "1W");
  assert.equal(first, second);
  assert.equal(reads, 1);
  feed.update({ heat_us: [], heat_kr: [], macro: [], watch: [] });
  assert.notEqual(await feed.bars(sym, "1W"), first);
  assert.equal(reads, 2);
});

test("큰 차트는 countBack 단위로 구간 탐색하고 마지막 페이지를 구분한다", async () => {
  const feed = new BoardDatafeed(async () => ({ sym: "QLD", d: rows(days(1000)) }));
  feed.registry.set("QLD", sym);
  const first = await feed.getBars({ symbol: "QLD" }, "1D", { to: Infinity, countBack: 250 });
  assert.equal(first.bars.length, 250);
  assert.equal(first.noMoreData, false);
  const second = await feed.getBars({ symbol: "QLD" }, "1D",
    { to: first.bars[0].time - 1, countBack: 250 });
  assert.equal(second.bars.length, 250);
  assert.equal(second.noMoreData, false);
  const last = await feed.getBars({ symbol: "QLD" }, "1D",
    { to: first.bars[0].time - 1, countBack: 1000 });
  assert.equal(last.bars.length, 750);
  assert.equal(last.noMoreData, true);
});

test("차트 처음에는 최근 일봉만 받고 과거 스크롤할 때만 전체 이력을 받는다", async () => {
  const calls = [];
  const all = days(1500);
  const feed = new BoardDatafeed(async (col, doc) => {
    calls.push(`${col}/${doc}`);
    if (col === "barsrecent") return { sym: "QLD", d: rows(all.slice(-600)) };
    if (col === "bars") return { sym: "QLD", d: rows(all) };
    return null;
  });
  feed.registry.set("QLD", sym);
  const latest = await feed.getBars({ symbol: "QLD" }, "1D", { to: Infinity, countBack: 200 });
  assert.equal(latest.bars.length, 200);
  assert.deepEqual(calls, ["barsrecent/QLD"]);
  const older = await feed.getBars({ symbol: "QLD" }, "1D",
    { to: latest.bars[0].time - 1, countBack: 750 });
  assert.equal(older.bars.length, 750);
  assert.deepEqual(calls, ["barsrecent/QLD", "bars/QLD"]);
  await feed.getBars({ symbol: "QLD" }, "1D", { to: Infinity, countBack: 200 });
  assert.equal(calls.length, 2);
});

test("아직 barsrecent 파일이 없는 배포도 전체 일봉으로 표시한다", async () => {
  const calls = [];
  const feed = new BoardDatafeed(async col => {
    calls.push(col);
    return col === "bars" ? { sym: "QLD", d: rows(days(5)) } : null;
  });
  feed.registry.set("QLD", sym);
  const result = await feed.getBars({ symbol: "QLD" }, "1D", { to: Infinity, countBack: 3 });
  assert.equal(result.bars.length, 3);
  assert.deepEqual(calls, ["barsrecent", "bars"]);
});

test("차트 등록 정보와 호가 단위는 KRX에 맞게 생성한다", () => {
  const registry = buildRegistry({ heat_us: [], heat_kr: [], macro: [],
    watch: [{ yf: "005930.KS", code: "005930", name: "삼성전자", market: "KR",
      last: 75000, prev: 74000, chg_pct: 1.35, doc: "005930.KS", accounts: [] }] });
  const feed = new BoardDatafeed(async () => null);
  feed.registry = registry;
  const info = feed.info(registry.get("005930.KS"));
  assert.equal(info.timezone, "Asia/Seoul");
  assert.equal(info.tickSize(75000), 100);
  assert.deepEqual(info.supportedResolutions, ["60", "1D", "1W", "1M"]);
});

test("신규 상장 첫 거래일은 가격을 표시하되 전일비를 미확인으로 구분한다", () => {
  const registry = buildRegistry({ heat_us: [], heat_kr: [], macro: [], watch: [
    { yf: "NEW", code: "NEW", name: "신규 상장", market: "US", last: 42, prev: 42,
      chg_pct: 0, change_unavailable: true, doc: "NEW", accounts: [] },
  ] });
  assert.equal(registry.get("NEW").last, 42);
  assert.equal(registry.get("NEW").changeUnavailable, true);
});
