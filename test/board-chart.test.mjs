import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// 원본 JSX가 없는 기존 번들에서 차트 공급자 메서드를 꺼내 검증한다.
// 번들을 갱신해도 실제 배포 파일의 60분봉 분리 및 과거 조회가 회귀하지 않게 한다.
const source = readFileSync(new URL("../assets/sise.js", import.meta.url), "utf8");
const pick = (start, end) => {
  const a = source.indexOf(start);
  assert.ok(a >= 0, start + " is present");
  const b = source.indexOf(end, a + start.length);
  assert.ok(b > a, end + " is present");
  return source.slice(a, b);
};
const bars = pick("async bars(t,e)", "info(t)");
const getBars = pick("async getBars(t,e,n)", "subscribeBars(t,e,n,i,a)");
const Feed = new Function("l1", "s1", "c1", "ww", `return class Feed {
  constructor(loader){this.loader=loader;this.docs=new Map;this.registry=new Map}
  load(t){let k=t.col+"/"+t.doc;if(!this.docs.has(k))this.docs.set(k,this.loader(t.col,t.doc).catch(()=>null));return this.docs.get(k)}
  ${bars}
  ${getBars}
}`)(
  () => "America/New_York",
  (raw) => raw.t.map((time, i) => ({ time, close: raw.c[i] })),
  (b) => b,
  (d) => d,
);
const rows = (count, base = 0) => ({ t: Array.from({ length: count }, (_, i) => i + base),
  c: Array.from({ length: count }, (_, i) => i + base) });

test("60분봉은 별도 파일을 우선하고 요청당 한 번만 읽는다", async () => {
  const calls = [];
  const feed = new Feed(async (col, doc) => {
    calls.push(col + "/" + doc);
    return col === "bars" ? { sym: "QLD", d: rows(5), h: rows(1) }
      : { sym: "QLD", h: rows(220, 10) };
  });
  const sym = { col: "bars", doc: "QLD", sym: "QLD" };
  const once = await feed.bars(sym, "60");
  const again = await feed.bars(sym, "60");
  assert.equal(once.length, 220);
  assert.equal(again.length, 220);
  assert.deepEqual(calls, ["hourly/QLD"]); // 별도 시간봉이 있으면 큰 일봉 파일은 아예 읽지 않음
});

test("새 시간봉 파일이 없을 때 기존 bars.h로 되돌아간다", async () => {
  const feed = new Feed(async (col) => col === "bars"
    ? { sym: "QLD", d: rows(5), h: rows(3) } : null);
  assert.equal((await feed.bars({ col: "bars", doc: "QLD", sym: "QLD" }, "60")).length, 3);
});

test("차트 구간 탐색은 countBack만 반환하고 오래된 데이터의 존재를 알린다", async () => {
  const feed = new Feed(async () => ({ sym: "QLD", d: rows(1000) }));
  feed.registry.set("QLD", { col: "bars", doc: "QLD", sym: "QLD" });
  const page1 = await feed.getBars({ symbol: "QLD" }, "1D", { to: 1000, countBack: 250 });
  assert.equal(page1.bars.length, 250);
  assert.equal(page1.noMoreData, false);
  const page2 = await feed.getBars({ symbol: "QLD" }, "1D", { to: page1.bars[0].time - 1, countBack: 250 });
  assert.equal(page2.bars.length, 250);
  assert.equal(page2.noMoreData, false);
  const page3 = await feed.getBars({ symbol: "QLD" }, "1D", { to: 100, countBack: 250 });
  assert.equal(page3.bars.length, 101);
  assert.equal(page3.noMoreData, true);
});
