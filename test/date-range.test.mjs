import test from "node:test";
import assert from "node:assert/strict";
import { closestDateIndex, normalizeDateRange } from "../assets/date-range.js";

test("closestDateIndex: 기록 밖 날짜는 경계로, 비거래일은 가까운 기록으로", () => {
  const dates = ["2026-11-20", "2026-11-23", "2026-11-25", "2026-11-27"];
  assert.equal(closestDateIndex(dates, "2026-11-01"), 0);
  assert.equal(closestDateIndex(dates, "2026-12-10"), 3);
  assert.equal(closestDateIndex(dates, "2026-11-24"), 1); // 같은 거리라면 앞 날짜
  assert.equal(closestDateIndex(dates, "2026-11-26"), 2);
  assert.equal(closestDateIndex(dates, "2026-11-27"), 3);
});

test("normalizeDateRange: 시작일·종료일이 교차하면 변경한 경계를 유지", () => {
  const dates = ["2026-11-20", "2026-11-23", "2026-11-25"];
  assert.deepEqual(normalizeDateRange(dates, "2026-11-25", "2026-11-20", "from"),
    { start: 2, end: 2, from: "2026-11-25", to: "2026-11-25" });
  assert.deepEqual(normalizeDateRange(dates, "2026-11-25", "2026-11-20", "to"),
    { start: 0, end: 0, from: "2026-11-20", to: "2026-11-20" });
});

test("normalizeDateRange: 데이터가 하루이거나 없더라도 범위가 유효", () => {
  assert.deepEqual(normalizeDateRange(["2026-11-27"], "2024-01-01", "2028-01-01"),
    { start: 0, end: 0, from: "2026-11-27", to: "2026-11-27" });
  assert.deepEqual(normalizeDateRange([], "2026-11-27", "2026-11-27"),
    { start: -1, end: -1, from: null, to: null });
});

test("normalizeDateRange: 1,111일 이력에서도 직접 날짜 선택 결과가 정확", () => {
  const dates = Array.from({ length: 1111 }, (_, i) => new Date(Date.UTC(2023, 10, 13 + i)).toISOString().slice(0, 10));
  const w = normalizeDateRange(dates, "2025-06-01", "2026-06-30");
  assert.equal(w.from, "2025-06-01");
  assert.equal(w.to, "2026-06-30");
});
