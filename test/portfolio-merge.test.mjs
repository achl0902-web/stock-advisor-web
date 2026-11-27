import test from "node:test";
import assert from "node:assert/strict";
import { mergedView } from "../assets/portfolio-merge.js";

function account({ qty, avg, value, cash = 0, live = true, date = null }) {
  return {
    a: { cash_krw: cash, cash_usd: 0 },
    rows: [{ h: { symbol: "QLD", qty, avg_price: avg }, q: { price: 80 }, value, weight: 100 }],
    cash, total: value + cash, live, cashMissingFx: false,
    fallbackWorthDate: date,
  };
}

test("동일 기준의 계좌는 보유 수량과 평단을 합산한다", () => {
  const merged = mergedView([
    account({ qty: 2, avg: 60, value: 160, cash: 20 }),
    account({ qty: 2, avg: 80, value: 160, cash: 40 }),
  ]);
  assert.equal(merged.total, 380);
  assert.equal(merged.cash, 60);
  assert.equal(merged.rows[0].h.qty, 4);
  assert.equal(merged.rows[0].h.avg_price, 70);
  assert.equal(merged.mixedBasis, false);
});

test("현재값과 과거값 또는 서로 다른 과거 날짜를 전체 자산으로 합산하지 않는다", () => {
  const current = account({ qty: 1, avg: 60, value: 80 });
  const old = account({ qty: 1, avg: 60, value: 70, live: false, date: "2026-11-25" });
  const older = account({ qty: 1, avg: 60, value: 65, live: false, date: "2026-11-24" });
  assert.equal(mergedView([current, old]).total, null);
  assert.equal(mergedView([old, older]).total, null);
  assert.equal(mergedView([old, older]).cash, null);
  assert.equal(mergedView([old, old]).total, 140);
});

test("환율이 없는 현금은 전체 계좌 현금 비율로 합산하지 않는다", () => {
  const a = account({ qty: 1, avg: 60, value: 80 });
  a.cash = null;
  a.cashMissingFx = true;
  const result = mergedView([a]);
  assert.equal(result.cash, null);
  assert.equal(result.cashPct, null);
  assert.equal(result.cashMissingFx, true);
});
