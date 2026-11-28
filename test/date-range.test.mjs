import test from "node:test";
import assert from "node:assert/strict";
import { closestDateIndex, normalizeDateRange, rangePercent, shiftDateIndexByDays } from "../assets/date-range.js";

test("양쪽 슬라이더 손잡이와 선택 구간은 언제나 동일한 전체 날짜 축을 사용한다", () => {
  assert.equal(rangePercent(0, 450), 0);
  assert.equal(rangePercent(449, 450), 100);
  assert.equal(rangePercent(80, 450), 80 / 449 * 100);
  assert.equal(rangePercent(80, 450), rangePercent(80, 450), "날짜 인덱스 위치는 반대쪽 손잡이 값과 무관하다");
  assert.equal(rangePercent(0, 1), 0);
  assert.equal(rangePercent(-10, 450), 0);
  assert.equal(rangePercent(999, 450), 100);
});

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

test("±7일은 기록 7개가 아닌 달력 7일로 이동한다", () => {
  const dates = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19",
    "2026-11-20", "2026-11-23", "2026-11-24", "2026-11-25"];
  assert.equal(dates[shiftDateIndexByDays(dates, 0, 7)], "2026-11-23");
  assert.equal(dates[shiftDateIndexByDays(dates, 7, -7)], "2026-11-18");
  assert.equal(shiftDateIndexByDays(dates, 0, -7), 0);
  assert.equal(shiftDateIndexByDays(dates, 7, 7), 7);
});
