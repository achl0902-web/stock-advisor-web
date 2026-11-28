import test from "node:test";
import assert from "node:assert/strict";
import { shouldAutoCollect } from "../src/board-refresh-policy.js";

const at = time => new Date(time);
const snapshot = (asof, crypto = false) => ({ asof,
  macro: crypto ? [{ sym: "BTC-KRW" }] : [], watch: [] });

test("휴장일 미국 종가를 페이지 열 때마다 다시 수집하지 않는다", () => {
  const now = at("2026-11-28T03:00:00Z"); // 미국 금요일 장 마감 뒤, 한국 토요일
  assert.equal(shouldAutoCollect(snapshot("2026-11-27T00:00:00Z"), now), false);
});

test("미국 정규장 중 10분을 넘긴 스냅숏은 재수집한다", () => {
  const now = at("2026-11-27T16:00:00Z"); // 금요일 NY 11시
  assert.equal(shouldAutoCollect(snapshot("2026-11-27T15:49:00Z"), now), true);
  assert.equal(shouldAutoCollect(snapshot("2026-11-27T15:55:00Z"), now), false);
});

test("코인 데이터는 휴장일에도 1시간 이상 경과하면 새로 수집한다", () => {
  const now = at("2026-11-28T03:00:00Z");
  assert.equal(shouldAutoCollect(snapshot("2026-11-28T01:00:00Z", true), now), true);
  assert.equal(shouldAutoCollect(snapshot("2026-11-28T02:45:00Z", true), now), false);
});
