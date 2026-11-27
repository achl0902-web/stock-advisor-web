import test from "node:test";
import assert from "node:assert/strict";
import { GithubBoard } from "../src/github-board.js";

function collector() {
  let ms = 0;
  const client = new GithubBoard({ owner: "test", repo: "test", token: "synthetic" },
    { now: () => ms, sleep: async seconds => { ms += seconds; } });
  client.head = "first";
  client.collecting = async () => false;
  return client;
}

test("자산 이력 커밋은 수집 완료가 아니며 새 시세 시각에만 완료한다", async () => {
  const client = collector();
  const stamps = {
    first: "2026-11-27T13:00:01+09:00",
    history: "2026-11-27T13:00:01+09:00",
    quote: "2026-11-27T13:00:42+09:00",
  };
  const commits = ["history", "quote"];
  let polls = 0, dispatches = 0;
  client.json = async () => ({ asof: stamps[client.head] });
  client.req = async path => {
    if (path.endsWith("/dispatches")) { dispatches++; return null; }
    if (path.endsWith("/branches/board-data")) {
      polls++;
      client.nextHead = commits.shift();
      return { commit: { sha: client.nextHead } };
    }
    throw Error(`예상하지 못한 요청: ${path}`);
  };
  client.refresh = async () => { client.head = client.nextHead; return true; };
  assert.equal(await client.collect(() => {}, 300000), true);
  assert.equal(polls, 2);
  assert.equal(dispatches, 1);
});

test("시세가 바뀌지 않으면 이력 커밋만으로 성공하지 않는다", async () => {
  const client = collector();
  client.collecting = async () => true;
  client.json = async () => ({ asof: "2026-11-27T13:00:01+09:00" });
  client.req = async path => {
    if (path.endsWith("/branches/board-data")) return { commit: { sha: "history" } };
    throw Error(`예상하지 못한 요청: ${path}`);
  };
  client.refresh = async () => { client.head = "history"; return true; };
  await assert.rejects(client.collect(() => {}, 5000),
    /수집이 5분 안에 끝나지 않았어요/);
});
