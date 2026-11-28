import test from "node:test";
import assert from "node:assert/strict";
import { assetQuotesComplete, accountView, loadAssetModel, pickBoard, quoteStatus, state, valueAccount } from "../assets/store.js";

test("loadAssetModel: 판단 기록 트리/실행 파일 없이 계좌와 시세만 읽는다", async () => {
  const calls = [];
  const accounts = { main: { label: "주 계좌", cash_usd: 100, holdings: [{ symbol: "QLD", qty: 2, currency: "USD", avg_price: 60 }] } };
  const snapshot = { asof: "2026-11-27T12:53:00+09:00", watch: [{ code: "QLD", last: 75, date: "2026-11-25", market: "US", name: "QLD" }], macro: [{ sym: "KRW=X", last: 1400 }], errors: [] };
  const worth = { t: ["2026-11-26", "2026-11-27"], v: { main: [100, 200] } };
  const repo = {
    headOnly: async () => { calls.push("head"); return { sha: "abc", date: "2026-11-27T03:53:00Z", message: "test" }; },
    raw: async path => { calls.push(path); return path === "config/accounts.json" ? accounts : null; },
    board: async (file, pick = x => x) => { calls.push(file); return file === "market--snapshot.json" ? pick(snapshot) : worth; },
    index: async () => { throw Error("자산 탭에서 전체 트리를 요청하면 안 됨"); },
    json: async () => { throw Error("자산 탭에서 판단 파일을 요청하면 안 됨"); },
  };
  const model = await loadAssetModel(repo);
  assert.equal(model.light, true);
  assert.equal(model.runs.length, 0);
  assert.equal(model.quotes.QLD.barDate, "2026-11-25");
  assert.equal(model.fx, 1400);
  assert.equal(model.worth, worth);
  assert.equal(calls.length, 6);
  const val = valueAccount(accounts.main, model.quotes, model.fx, null);
  assert.equal(val.total, (2 * 75 + 100) * 1400);
});

test("quoteStatus: 수집 시각과 마지막 가격일을 구분하고 실패를 우선 표시", () => {
  const board = pickBoard({ asof: "2026-11-27T12:53:00+09:00", watch: [{ code: "QLD", last: 70, date: "2026-11-25", market: "US" }], errors: ["005930.KS"] });
  assert.equal(board.quotes.QLD.barDate, "2026-11-25");
  const model = { boardAt: new Date(board.asof), boardErrors: board.errors };
  assert.deepEqual(quoteStatus(model, new Date("2026-11-27T13:05:00+09:00")), { asof: model.boardAt, ageMinutes: 12, errors: ["005930.KS"], stale: [], level: "error" });
  assert.equal(quoteStatus({ ...model, boardErrors: [] }, new Date("2026-11-27T13:30:00+09:00")).level, "old");
  assert.equal(quoteStatus({ boardAt: null }).level, "missing");
});

test("최신 수집 시각이어도 종목별 종가가 낡았으면 시세 지연으로 판정한다", () => {
  const board = pickBoard({
    asof: "2026-11-28T10:54:46+09:00",
    watch: [{ code: "QLD", last: 68.15, date: "2026-11-25", market: "US" }],
    errors: ["QLD"],
    stale_quotes: [{ sym: "QLD", date: "2026-11-25", expected: "2026-11-27" }],
  });
  const model = { boardAt: new Date(board.asof), boardErrors: board.errors, boardStale: board.stale };
  const status = quoteStatus(model, new Date("2026-11-28T10:58:00+09:00"));
  assert.equal(status.ageMinutes, 3);
  assert.equal(status.level, "error");
  assert.deepEqual(status.stale, [{ sym: "QLD", date: "2026-11-25", expected: "2026-11-27" }]);
  assert.equal(board.quotes.QLD.barDate, "2026-11-25");
  assert.equal(quoteStatus({ ...model, boardErrors: [] }, new Date("2026-11-28T10:58:00+09:00")).level, "error");
});

test("assetQuotesComplete: 누락된 가격·환율이 있으면 예전 분석값 대체 경로를 유지", () => {
  const accounts = { main: { cash_usd: 50, holdings: [{ symbol: "QLD", qty: 2, currency: "USD" }] } };
  assert.equal(assetQuotesComplete(accounts, { QLD: { price: 70 } }, 1400), true);
  assert.equal(assetQuotesComplete(accounts, {}, 1400), false);
  assert.equal(assetQuotesComplete(accounts, { QLD: { price: 70 } }, null), false);
});

test("미장 종가가 오래되면 현재 평가액·수익률 계산에 사용하지 않는다", () => {
  const accounts = { main: { cash_usd: 10, holdings: [{ symbol: "NEW", qty: 10, avg_price: 100, currency: "USD" }] } };
  const board = pickBoard({ asof: "2026-11-28T10:00:00+09:00", watch: [
    { code: "NEW", yf: "NEW", last: 50, date: "2026-11-24", market: "US" }],
    required_quotes: { NEW: "2026-11-27" },
    errors: ["NEW"], stale_quotes: [{ sym: "NEW", date: "2026-11-24", expected: "2026-11-27" }] });
  const quotes = { ...board.quotes };
  assert.equal(quotes.NEW.invalid, true);
  assert.equal(assetQuotesComplete(accounts, quotes, 1400), false);
  const account = valueAccount(accounts.main, quotes, 1400, { total_krw: 500000 }, { requireVerified: true });
  assert.equal(account.total, 500000);
  assert.equal(account.live, false);
  assert.equal(account.rows[0].value, null);
  assert.equal(account.rows[0].pl, null);
});

test("오래된 환율·BTC 종가는 검증 실패로 보류하고 KIS 제공자는 표시한다", () => {
  const board = pickBoard({ asof: "2026-11-28T10:00:00+09:00",
    macro: [{ sym: "KRW=X", last: 1400, date: "2026-11-25" },
      { sym: "BTC-KRW", last: 100000000, date: "2026-11-26" }],
    watch: [{ code: "QLD", yf: "QLD", last: 75, date: "2026-11-27", market: "US" }],
    required_quotes: { "KRW=X": "2026-11-27", "BTC-KRW": "2026-11-27", QLD: "2026-11-27" },
    quote_fallbacks: [{ sym: "QLD", source: "KIS", date: "2026-11-27" }], errors: [] });
  assert.equal(board.fx, null);
  assert.equal(board.fxStale, true);
  assert.equal(board.quotes.BTC.invalid, true);
  assert.equal(board.quotes.QLD.source, "KIS");
  assert.equal(board.quotes.QLD.invalid, false);
});

test("자산 시세가 누락돼도 전체 판단 트리를 다시 읽지 않고 마지막 평가 이력을 활용한다", async () => {
  const calls = [];
  const accounts = { main: { label: "주 계좌", cash_usd: 100, holdings: [
    { symbol: "QLD", qty: 2, currency: "USD", avg_price: 60 },
  ] } };
  const worth = { t: ["2026-11-25", "2026-11-26"], v: { main: [500000, 520000] } };
  const repo = {
    headOnly: async () => ({ sha: "test", date: "2026-11-27" }),
    raw: async path => path === "config/accounts.json" ? accounts : null,
    board: async name => name === "networth--history.json" ? worth : null,
    index: async () => { calls.push("heavy index"); throw Error("전체 트리를 읽어서는 안 됩니다"); },
  };
  const model = await loadAssetModel(repo);
  assert.equal(model.light, true);
  assert.deepEqual(calls, []);
  state.model = model;
  try {
    const result = accountView("main");
    assert.equal(result.total, 520000);
    assert.equal(result.fallbackWorthDate, "2026-11-26");
    assert.equal(result.cash, null);
    assert.equal(result.cashPct, null);
    assert.equal(result.live, false);
  } finally { state.model = null; }
});

test("달러 현금 환산에 필요한 환율이 없으면 부분 합계를 전체 현금으로 표시하지 않는다", () => {
  const a = { cash_krw: 10000, cash_usd: 100, holdings: [] };
  const result = valueAccount(a, {}, null, { total_krw: 150000 });
  assert.equal(result.total, 150000);
  assert.equal(result.cash, null);
  assert.equal(result.cashMissingFx, true);
  assert.equal(result.cashPct, null);
});
