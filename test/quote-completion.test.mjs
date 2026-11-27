import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// 원본 차트 소스가 없는 기존 번들의 수집 메서드만 분리해 계약을 검증한다.
// 새 시세 수집 중 다른 워크플로의 networth 커밋이 올라와도 완료로 처리하면 안 된다.
const bundle = readFileSync(new URL("../assets/sise.js", import.meta.url), "utf8");
const start = bundle.indexOf("async collect(t,e=300000)");
const finish = bundle.indexOf("json(t,e)", start);
assert.ok(start >= 0 && finish > start, "차트 수집 메서드를 찾을 수 없습니다");
const source = bundle.slice(start, finish);

class Di extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function collector(fakeDate = Date) {
  const C = new Function("Di", "setTimeout", "Date", `return class C {${source}}`)(Di, cb => cb(), fakeDate);
  const obj = new C();
  obj.cfg = { owner: "test", repo: "test" };
  obj.head = "first";
  obj.collecting = async () => false;
  return obj;
}

test("자산 이력 커밋은 수집 완료가 아니며 새 시세 시각에만 완료한다", async () => {
  const c = collector();
  const stamps = { first: "2026-11-27T13:00:01+09:00", history: "2026-11-27T13:00:01+09:00", quote: "2026-11-27T13:00:42+09:00" };
  const commits = ["history", "quote"];
  let polls = 0, dispatches = 0;
  c.json = async () => ({ asof: stamps[c.head] });
  c.req = async path => {
    if (path.endsWith("/dispatches")) { dispatches++; return null; }
    if (path.endsWith("/branches/board-data")) {
      polls++;
      c.nextHead = commits.shift();
      return { commit: { sha: c.nextHead } };
    }
    throw Error(`예상하지 못한 요청: ${path}`);
  };
  c.refresh = async () => { c.head = c.nextHead; return true; };
  assert.equal(await c.collect(() => {}, 300000), true);
  assert.equal(polls, 2, "이력 커밋 후에도 새 시세를 기다려야 합니다");
  assert.equal(dispatches, 1);
  assert.equal(c.head, "quote");
});

test("시세가 바뀌지 않으면 이력 커밋만으로 성공하지 않는다", async () => {
  let seconds = 0;
  const c = collector({ now: () => seconds++ * 1000 });
  c.collecting = async () => true;
  c.json = async () => ({ asof: "2026-11-27T13:00:01+09:00" });
  c.req = async path => {
    if (path.endsWith("/branches/board-data")) return { commit: { sha: "history" } };
    throw Error(`예상하지 못한 요청: ${path}`);
  };
  c.refresh = async () => { c.head = "history"; return true; };
  await assert.rejects(c.collect(() => {}, 5000), /수집이 5분 안에 끝나지 않았어요/);
});
