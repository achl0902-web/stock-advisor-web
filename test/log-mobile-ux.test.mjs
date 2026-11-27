import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

test("P4 기록: 입력 포커스를 유지하며 불러온 판단만 검색하고, 늦은 상세 응답은 표시하지 않는다", async () => {
  const dom = new JSDOM("<!doctype html><main id='view'></main>", {
    url: "https://example.test/log.html#/log", pretendToBeVisual: true,
  });
  const old = Object.fromEntries(["window", "document", "location"].map(k => [k, globalThis[k]]));
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;

  try {
    const { state } = await import("../assets/store.js");
    const { renderRuns, renderRun } = await import("../assets/view-log.js");
    const mk = (id, name, symbol, accountKey, at, decision) => ({
      id, name, symbol, accountKey, at: new Date(at), dec: { decision }, price: 100,
      currency: "KRW", plan: {},
    });
    const qld = mk("r1", "나스닥 레버리지", "QLD", "main", "2026-11-27T10:00:00+09:00", "buy");
    const bio = mk("r2", "보로노이", "295310", "bio", "2026-11-26T10:00:00+09:00", "hold");
    state.model = {
      accounts: { main: { label: "주 계좌" }, bio: { label: "바이오 계좌" } },
      doneIds: ["r1", "r2", "unloaded"], shown: 2,
      byId: new Map([["r1", qld], ["r2", bio]]), byRun: {}, names: {},
      refCount: 0, collectOnly: 0,
    };
    renderRuns();
    const root = dom.window.document.querySelector("#view");
    const search = root.querySelector("#run-search");
    assert.equal(root.querySelectorAll(".rr").length, 2);
    assert.match(root.querySelector("#run-search-summary").textContent, /전체 3건 · 불러온 2건/);

    search.focus();
    search.value = "qld";
    search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    assert.equal(root.querySelectorAll(".rr").length, 1);
    assert.match(root.querySelector(".rr").textContent, /나스닥 레버리지/);
    assert.equal(root.querySelector("#run-search"), search, "검색 중 입력창 자체를 재생성하지 않는다");
    assert.equal(dom.window.document.activeElement, search, "모바일 키보드·포커스를 유지한다");

    search.value = "2026-11-26";
    search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    assert.equal(root.querySelectorAll(".rr").length, 1, "날짜로도 검색한다");
    assert.match(root.querySelector(".rr").textContent, /보로노이/);
    search.value = "11/26";
    search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    assert.match(root.querySelector(".rr").textContent, /보로노이/, "모바일에서 입력하기 쉬운 월\/일 검색도 지원");
    root.querySelector('[data-chip="main"]').click();
    assert.equal(root.querySelectorAll(".rr").length, 0, "계좌 필터와 검색을 동시에 적용한다");
    root.querySelector('[data-chip="all"]').click();
    assert.equal(root.querySelectorAll(".rr").length, 1, "계좌 필터 변경 후 검색을 유지한다");
    const nextSearch = root.querySelector("#run-search");
    nextSearch.value = "없는 종목";
    nextSearch.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    assert.equal(root.querySelectorAll(".rr").length, 0);
    assert.match(root.querySelector("#run-results").textContent, /이전 판단을 더 불러오세요/);
    assert.ok(root.querySelector("#more-runs"), "아직 불러오지 않은 판단을 확인할 경로는 유지한다");

    renderRuns("QLD");
    assert.equal(root.querySelector("#run-search").value, "QLD", "오늘의 주문에서 연결된 티커가 검색창에 입력된다");
    assert.equal(root.querySelectorAll(".rr").length, 1, "연결된 티커에 해당하는 판단만 보여 준다");
    assert.match(root.querySelector(".rr").textContent, /나스닥 레버리지/);

    let finishFirst;
    state.repo = {
      text: path => path.includes("r1") ? new Promise(resolve => { finishFirst = resolve; }) : Promise.resolve("두번째 판단의 근거"),
      json: async () => [],
    };
    location.hash = "#/run/r1";
    const first = renderRun("r1");
    location.hash = "#/run/r2";
    await renderRun("r2");
    assert.match(root.querySelector("#report").textContent, /두번째 판단/);
    finishFirst("첫번째 판단의 근거");
    await first;
    assert.match(root.querySelector("#report").textContent, /두번째 판단/);
    assert.doesNotMatch(root.querySelector("#report").textContent, /첫번째 판단/);
  } finally {
    for (const [k, v] of Object.entries(old)) {
      if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
    }
    dom.window.close();
  }
});

test("P4 검색 필드는 좁은 폭에서도 내용이 넘치지 않고 충분한 터치 크기를 갖는다", () => {
  const css = readFileSync(new URL("../assets/app.css", import.meta.url), "utf8");
  assert.match(css, /\.log-search\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /\.log-search input\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*min-height:\s*44px/);
  assert.match(css, /\.log-search input:focus-visible\s*\{/);
  assert.match(css, /@media \(max-width: 390px\)\s*\{\s*\.rr, \.bars a\s*\{[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\)/);
});
