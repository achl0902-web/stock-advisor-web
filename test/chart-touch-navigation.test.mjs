import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { bindLines, line } from "../assets/chart.js";

test("차트는 터치 외에도 44px 이상 버튼으로 날짜를 정확히 탐색하고 빈 날을 건너뛴다", () => {
  const dom = new JSDOM("<!doctype html><main id='root'></main>", { pretendToBeVisual: true });
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  try {
    const root = dom.window.document.querySelector("#root");
    const points = [
      { t: "2026-11-24", v: 100, p: 90 },
      { t: "2026-11-25", v: null, p: null },
      { t: "2026-11-26", v: 120, p: 100 },
      { t: "2026-11-27", v: 140, p: 110 },
    ];
    root.innerHTML = line(points, { fmt: v => `${v}원`, label: "합산 자산 평가액" });
    bindLines(root);
    const chart = root.querySelector("[data-line]");
    const nav = root.querySelector(".ln-inspect");
    const previousButton = nav.querySelector('[data-line-step="-1"]');
    const nextButton = nav.querySelector('[data-line-step="1"]');
    const readout = nav.querySelector(".ln-selected");

    assert.equal(readout.getAttribute("aria-live"), "polite");
    assert.match(readout.textContent, /140원/);
    assert.equal(nextButton.disabled, true);
    previousButton.click();
    assert.match(readout.textContent, /120원/);
    assert.match(readout.textContent, /100원/, "원금도 함께 표시");
    previousButton.click();
    assert.match(readout.textContent, /100원/);
    assert.equal(previousButton.disabled, true, "처음 기록 이전으로는 이동하지 않음");
    nextButton.click();
    assert.match(readout.textContent, /120원/, "값이 없는 11/25는 건너뜀");

    chart.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    assert.match(readout.textContent, /11\/24/);
    chart.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "End", bubbles: true }));
    assert.match(readout.textContent, /11\/27/);
    chart.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    assert.match(readout.textContent, /11\/26/);
    chart.querySelector("svg").getBoundingClientRect = () => ({ left: 0, width: 300 });
    chart.dispatchEvent(new dom.window.MouseEvent("pointerdown", { clientX: 0, bubbles: true }));
    assert.match(readout.textContent, /11\/24/);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
    dom.window.close();
  }
});
