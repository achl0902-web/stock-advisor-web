import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

test("복구한 시세판이 가짜 시세 데이터로 종목·차트·관심종목 UI를 만든다", async () => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", error => errors.push(error.stack || error.message));
  vc.on("error", error => errors.push(error?.stack || String(error)));
  const dom = new JSDOM("<!doctype html><html lang='ko'><body><div id='root'></div></body></html>", {
    url: "https://example.test/", runScripts: "outside-only",
    pretendToBeVisual: true, virtualConsole: vc,
  });
  const { window } = dom;
  const quote = { yf: "QLD", sym: "QLD", code: "QLD", name: "QLD", doc: "QLD",
    market: "US", last: 100, prev: 99, chg_pct: 1.01,
    spark: [98, 99, 100], accounts: [], lines: [], orders: [] };
  const bio = { ...quote, yf: "BIO", sym: "BIO", code: "BIO", name: "바이오", doc: "BIO", market: "KR", last: 120, prev: 118 };
  const snapshot = { asof: new Date().toISOString(), macro: [], watch: [quote, bio],
    heat_us: [], heat_kr: [], crypto: null };
  const data = { snapshot, daily: { sym: "QLD", d: {
    t: ["2026-11-25", "2026-11-26", "2026-11-27"], o: [98, 99, 100],
    h: [99, 100, 102], l: [97, 98, 99], c: [99, 100, 101], v: [10, 20, 30] } },
    bio: { sym: "BIO", d: { t: ["2026-11-25", "2026-11-26", "2026-11-27"],
      o: [117, 118, 119], h: [118, 120, 122], l: [116, 117, 119], c: [118, 120, 121], v: [11, 13, 15] } } };
  window.localStorage.setItem("sa:settings", JSON.stringify({
    owner: "fake", repo: "fake", token: "synthetic-not-a-credential",
  }));
  window.matchMedia = query => ({ matches: query.includes("max-width: 760px"), addEventListener() {}, removeEventListener() {} });
  window.ResizeObserver = class { observe() {} disconnect() {} };
  window.IntersectionObserver = class { observe() {} disconnect() {} };
  const ctx = { measureText: text => ({ width: String(text).length * 7 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy(ctx, {
    get(target, prop) { return prop in target ? target[prop] : () => {}; },
  });
  window.fetch = async input => {
    const path = new URL(input).pathname;
    let body;
    if (path.endsWith("/branches/board-data")) body = { commit: { sha: "head" } };
    else if (path.endsWith("/git/trees/head")) body = { tree: [
      { type: "blob", path: "market--snapshot.json", sha: "snapshot" },
      { type: "blob", path: "bars--QLD.json", sha: "daily" },
      { type: "blob", path: "bars--BIO.json", sha: "bio" },
    ] };
    else if (path.endsWith("/git/blobs/snapshot")) body = data.snapshot;
    else if (path.endsWith("/git/blobs/daily")) body = data.daily;
    else if (path.endsWith("/git/blobs/bio")) body = data.bio;
    else throw Error("Unexpected fake URL: " + path);
    return { status: 200, ok: true, headers: { get() { return null; } },
      json: async () => body, text: async () => JSON.stringify(body) };
  };
  try {
    window.eval(readFileSync(new URL("../assets/sise.js", import.meta.url), "utf8"));
    await new Promise(resolve => setTimeout(resolve, 350));
    const body = window.document.querySelector("#root").textContent;
    assert.ok(body, "render errors: " + JSON.stringify(errors));
    assert.match(body, /관심종목/);
    assert.match(body, /QLD/);
    assert.ok(window.document.querySelector(".chart-host"));
    assert.equal(window.document.querySelectorAll(".quick-symbols .quick-pick").length, 2,
      "모바일에서 차트보다 위에서 종목을 선택할 수 있음");
    assert.equal(window.document.querySelectorAll(".chart-mobile-nav button").length, 5,
      "모바일 가로축 이동·확대를 외부 버튼으로 제공");
    window.document.querySelectorAll(".chart-mobile-nav button").forEach(button => button.click());
    window.document.querySelector('.quick-pick[title="바이오 (BIO)"]').click();
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(window.document.querySelector('.quick-pick[aria-pressed="true"]').textContent, "바이오",
      "관심종목을 바꾸면 선택 상태가 한 번에 갱신됨");
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
