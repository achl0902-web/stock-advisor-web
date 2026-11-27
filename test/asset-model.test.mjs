import test from "node:test";
import assert from "node:assert/strict";
import { assetQuotesComplete, loadAssetModel, pickBoard, quoteStatus, valueAccount } from "../assets/store.js";

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
  assert.deepEqual(quoteStatus(model, new Date("2026-11-27T13:05:00+09:00")), { asof: model.boardAt, ageMinutes: 12, errors: ["005930.KS"], level: "error" });
  assert.equal(quoteStatus({ ...model, boardErrors: [] }, new Date("2026-11-27T13:30:00+09:00")).level, "old");
  assert.equal(quoteStatus({ boardAt: null }).level, "missing");
});

test("assetQuotesComplete: 누락된 가격·환율이 있으면 예전 분석값 대체 경로를 유지", () => {
  const accounts = { main: { cash_usd: 50, holdings: [{ symbol: "QLD", qty: 2, currency: "USD" }] } };
  assert.equal(assetQuotesComplete(accounts, { QLD: { price: 70 } }, 1400), true);
  assert.equal(assetQuotesComplete(accounts, {}, 1400), false);
  assert.equal(assetQuotesComplete(accounts, { QLD: { price: 70 } }, null), false);
});
