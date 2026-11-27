import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

test("오늘과 통합 자산 화면은 실제 DOM에서 렌더링되고 계좌 토글이 작동한다", async () => {
  const dom = new JSDOM("<!doctype html><main id='view'></main>", { url: "https://example.test/log.html#/today", pretendToBeVisual: true });
  const old = Object.fromEntries(["window", "document", "location", "addEventListener", "IntersectionObserver"].map(k => [k, globalThis[k]]));
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.addEventListener = dom.window.addEventListener.bind(dom.window);
  globalThis.IntersectionObserver = class { observe() {} disconnect() {} };
  dom.window.saFamily = false;
  try {
    const { state } = await import("../assets/store.js");
    const { renderToday } = await import("../assets/view-today.js");
    const { renderAccounts } = await import("../assets/view-assets.js");
    const t = ["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"];
    const accounts = Object.fromEntries(["main", "bio", "pension", "crypto"].map((k, i) => [k, {
      label: { main: "주 계좌", bio: "바이오 계좌", pension: "퇴직연금 DC", crypto: "비트코인" }[k],
      holdings: [{ symbol: k, qty: 1, avg_price: 100, currency: "KRW" }],
    }]));
    state.model = {
      accounts, quotes: Object.fromEntries(Object.keys(accounts).map(k => [k, { price: 100 }])),
      fx: 1350, boardAt: new Date(), boardErrors: [], names: {},
      worth: { t, v: { main: [100, 105, 110, 112], bio: [40, 42, 44, 46], pension: [300, 300, 301, 302], crypto: [30, 31, 32, 33] },
        f: Object.fromEntries(Object.keys(accounts).map(k => [k, [0, 0, 0, 0]])), fx: [1350, 1350, 1350, 1350], trades: {}, events: {} },
      alerts: { items: [] }, alertState: { fired: {} }, openOrders: [], doneIds: [], runs: [], shown: 0,
    };
    state.repo = { raw: async () => ({ items: [] }) };
    state.strategy = null;
    renderToday();
    assert.match(dom.window.document.querySelector("#view").textContent, /오늘/);
    assert.match(dom.window.document.querySelector("#view").textContent, /운용 계좌/);
    renderAccounts();
    const root = dom.window.document.querySelector("#view");
    assert.equal(root.querySelectorAll("[data-compare-key]").length, 4);
    assert.equal(root.querySelector('[data-compare-key="main"]').getAttribute("aria-pressed"), "true");
    assert.equal(root.querySelector('[data-compare-key="bio"]').getAttribute("aria-pressed"), "true");
    assert.equal(root.querySelector('[data-compare-key="crypto"]').getAttribute("aria-pressed"), "false");
    assert.ok(root.querySelectorAll(".donut").length >= 2);
    root.querySelector('[data-compare-key="crypto"]').click();
    assert.equal(root.querySelector('[data-compare-key="crypto"]').getAttribute("aria-pressed"), "true");
    root.querySelector('[data-compare-mode="total"]').click();
    assert.equal(root.querySelector('[data-compare-mode="total"]').getAttribute("aria-pressed"), "true");
    assert.match(root.querySelector(".compare-legend").textContent, /선택 합계/);
  } finally {
    for (const [k, v] of Object.entries(old)) {
      if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
    }
    dom.window.close();
  }
});
