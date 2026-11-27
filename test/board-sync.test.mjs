import test from "node:test";
import assert from "node:assert/strict";
import { snapshotTracker } from "../assets/board-sync.js";

test("시세판 첫 수집 시각은 홈 중복 갱신을 유발하지 않는다", () => {
  let count = 0;
  const track = snapshotTracker(() => count++);
  track({ stamp: "11/27 12:53", busy: false });
  track({ stamp: "11/27 12:53", busy: false });
  assert.equal(count, 0);
});

test("수집 중 표시가 해제되거나 시각이 바뀌면 홈을 다시 읽는다", () => {
  let count = 0;
  const track = snapshotTracker(() => count++);
  track({ stamp: "11/27 12:53", busy: false });
  track({ stamp: "11/27 12:53", busy: true });
  track({ stamp: "11/27 12:53", busy: true });
  track({ stamp: "11/27 13:02", busy: true });
  track({ stamp: "11/27 13:02", busy: false });
  assert.equal(count, 2);
});

test("라벨이 사라지는 중간 렌더에서는 변경을 감지하지 않는다", () => {
  let count = 0;
  const track = snapshotTracker(() => count++);
  track({ stamp: "11/27 12:53", busy: false });
  track({ stamp: "", busy: false });
  track({ stamp: "11/27 12:53", busy: false });
  assert.equal(count, 0);
});
