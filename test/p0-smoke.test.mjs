import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

test("오늘과 통합 자산 화면은 실제 DOM에서 렌더링되고 계좌 토글이 작동한다", async () => {
  const dom = new JSDOM("<!doctype html><main id='view'></main>", { url: "https://example.test/log.html#/today", pretendToBeVisual: true });
  const old = Object.fromEntries(["window", "document", "location", "addEventListener", "removeEventListener", "requestAnimationFrame", "cancelAnimationFrame", "IntersectionObserver"].map(k => [k, globalThis[k]]));
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.addEventListener = dom.window.addEventListener.bind(dom.window);
  globalThis.removeEventListener = dom.window.removeEventListener.bind(dom.window);
  globalThis.requestAnimationFrame = callback => { callback(); return 1; };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.IntersectionObserver = class { observe() {} disconnect() {} };
  dom.window.saFamily = false;
  try {
    const { state } = await import("../assets/store.js");
    const { renderToday } = await import("../assets/view-today.js");
    const { renderAccounts, renderLevels } = await import("../assets/view-assets.js");
    const t = ["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"];
    const accounts = Object.fromEntries(["main", "bio", "pension", "crypto"].map((k, i) => [k, {
      label: { main: "주 계좌", bio: "바이오 계좌", pension: "퇴직연금 DC", crypto: "비트코인" }[k],
      holdings: [{ symbol: k, qty: 1, avg_price: 100, currency: "KRW" }],
    }]));
    state.model = {
      accounts, quotes: Object.fromEntries(Object.keys(accounts).map(k => [k, { price: 100, verified: true }])),
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
    assert.equal(root.querySelector(".range-custom").open, true, "기간 슬라이더는 기본 펼침");
    assert.equal(root.querySelector(".range-fine").open, false, "정밀 날짜 입력은 보조 옵션");
    assert.equal(root.querySelector(".accounts").firstElementChild.classList.contains("account"), true, "계좌 선택 아래에 단일 성과 카드를 배치");
    assert.ok(root.querySelector(".account-filter").compareDocumentPosition(root.querySelector(".range")) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
    root.querySelector('[data-period="all"]').click();
    assert.equal(root.querySelector(".range-custom").open, true, "기간 버튼을 눌러도 슬라이더 유지");
    const pnlBefore = root.querySelector(".account .perf b").textContent;
    const from = root.querySelector('.range .slider input[data-end="from"]');
    from.value = "2";
    from.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    assert.equal(root.querySelector('[data-label="from"]').textContent, "26.11.26");
    assert.equal(root.querySelector('.range .slider input[data-end="from"]').getAttribute("aria-valuetext"), "2026년 11월 26일", "스크린리더에 축약 표기가 아닌 연월일 전달");
    assert.ok(root.querySelector('.range-steps').closest('.range-fine'), "미세 조정 버튼은 보조 메뉴로 이동한다");
    assert.equal(root.querySelectorAll('.range-step-pair button').length, 4);
    assert.equal(root.querySelectorAll('[data-select-end]').length, 2, "한 개의 슬라이더에서 시작일·종료일을 선택한다");
    assert.ok(root.querySelector('.range-float[hidden]'), "스크롤 전에는 고정 조작 바를 숨긴다");
    assert.equal(root.querySelectorAll('.slider').length, 1, "고정 조작 바에도 중복 슬라이더를 만들지 않는다");
    root.querySelector('[data-select-end="from"]').click();
    assert.equal(root.querySelector('.range .slider').dataset.activeEnd, "from");
    assert.equal(root.querySelector('[data-handle-date="from"]').textContent, "26.11.26");
    root.querySelector('[data-step-days="1"]').click();
    assert.equal(root.querySelector('[data-step-end="to"][data-step="-1"]').textContent, "−1일");
    assert.ok(root.querySelector('.account-selection'), "함께 선택한 계좌를 성과 카드 제목 아래에서 확인할 수 있다");
    assert.match(root.querySelector('.line svg').getAttribute('viewBox'), /0 0 600 240/);
    assert.ok(root.querySelector('.perf-baseline'), "수익률 기초일 계산 기준을 표시한다");
    assert.equal(root.querySelector('[data-period="all"]').getAttribute("aria-pressed"), "false");
    assert.notEqual(root.querySelector(".account .perf b").textContent, pnlBefore, "슬라이더 움직임이 기간 투자손익에 반영됨");
    assert.match(root.querySelector(".account").textContent, /투자수익률/);
    assert.equal(root.querySelectorAll("[data-compare-key]").length, 4);
    assert.equal(root.querySelector('[data-compare-key="main"]').getAttribute("aria-pressed"), "true");
    assert.equal(root.querySelector('[data-compare-key="bio"]').getAttribute("aria-pressed"), "true");
    assert.equal(root.querySelector('[data-compare-key="crypto"]').getAttribute("aria-pressed"), "false");
    assert.equal(root.querySelectorAll("[data-comparison], [data-compare-mode]").length, 0);
    assert.equal(root.querySelector("[data-comp]"), null, "중복 선택 계좌 구성 카드를 렌더링하지 않는다");
    assert.equal(root.querySelector("[data-acc]"), null, "하단 계좌 선택 버튼을 두지 않는다");
    assert.doesNotMatch(root.textContent, /선택 계좌 구성/);
    assert.equal(root.querySelectorAll(".accounts > .account").length, 1);
    assert.equal(root.querySelector(".accounts > .account").dataset.key, "all");
    assert.ok(root.querySelector(".account .donut"), "보유종목 구성 도넛은 유지한다");
    assert.equal(root.querySelector('.account .donut').getAttribute('style'), '--size:180px');
    assert.match(root.querySelector(".account").textContent, /투자수익률/);
    root.querySelector('[data-compare-key="crypto"]').click();
    assert.equal(root.querySelector('[data-compare-key="crypto"]').getAttribute("aria-pressed"), "true");
    assert.equal(root.querySelector(".accounts > .account").dataset.key, "all");
    root.querySelector('[data-compare-key="main"]').click();
    assert.equal(root.querySelector(".accounts > .account").dataset.key, "all");
    root.querySelector('[data-compare-key="bio"]').click();
    assert.equal(root.querySelector(".accounts > .account").dataset.key, "crypto", "계좌가 하나면 별도 선택 없이 상세 표시");
    assert.match(root.querySelector(".account h2").textContent, /비트코인/);
    assert.equal(root.querySelectorAll(".accounts > .account").length, 1);
    root.querySelector('[data-compare-key="crypto"]').click();
    assert.equal(root.querySelector('[data-compare-key="crypto"]').getAttribute("aria-pressed"), "true", "마지막 계좌는 끌 수 없다");

    dom.window.saFamily = true;
    renderAccounts();
    assert.deepEqual([...root.querySelectorAll("[data-compare-key]")].map(x => x.dataset.compareKey), ["main", "crypto"]);
    assert.equal(root.querySelector('a[href*="view=all"]'), null, "공유 화면에는 개인 모드 전환 링크가 없다");
    assert.doesNotMatch(root.textContent, /공유용 표시 모드|개인 보기 전환|바이오 계좌|퇴직연금 DC/);
    assert.equal(root.querySelector("[data-comp]"), null, "가족 보기에도 중복 구성을 추가하지 않는다");
    assert.equal(root.querySelector(".accounts > .account").dataset.key, "all");
    assert.equal(root.querySelector('[data-compare-key="crypto"]').getAttribute("aria-pressed"), "true");

    dom.window.saFamily = false;
    state.model.alerts.items = [{ code: "main", name: "주 종목", account: "주 계좌", market: "KR", alerts: [
      { id: "p5-main", op: ">=", price: 105, msg: "목표가: 확인" },
    ] }];
    state.model.openOrders = [{ code: "bio", name: "바이오 종목", side: "buy", account: "바이오 계좌", limit: 120, expires: "2026-12-01" }];
    renderToday();
    assert.ok(root.querySelector('a[href="#/market/levels/main"]'), "오늘의 관심가에서 특정 종목 관심가로 바로 이동한다");
    assert.ok(root.querySelector('a[href="#/log/search/bio"]'), "오늘의 미체결 주문에서 해당 종목 판단 검색으로 이동한다");
    renderLevels("main");
    assert.ok(root.querySelector('a[href="#/market/levels"]'), "한 종목 관심가에서 전체 목록으로 돌아갈 수 있다");
    assert.match(root.textContent, /주 종목/);
    assert.doesNotMatch(root.textContent, /바이오 종목/);
  } finally {
    for (const [k, v] of Object.entries(old)) {
      if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
    }
    dom.window.close();
  }
});
