import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("자산 날짜 선택기는 고정 폭 카드와 투명한 native 입력을 사용하며 아주 좁을 때만 세로 배치한다", () => {
  const css = readFileSync(new URL("../assets/app.css", import.meta.url), "utf8");
  const markup = readFileSync(new URL("../assets/view-assets.js", import.meta.url), "utf8");
  assert.match(css, /\.range\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /\.range-inputs\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.date-select\s*\{[^}]*overflow:\s*hidden/);
  assert.match(css, /\.date-select input\s*\{[^}]*position:\s*absolute;[^}]*max-width:\s*100%;[^}]*opacity:\s*0/);
  assert.match(css, /@media \(max-width:\s*360px\)\s*\{\s*\.range-inputs\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(markup, /data-date-value="\$\{end\}"/);
  assert.match(markup, /data-date="\$\{end\}"/);
  assert.match(markup, /\[data-date-value="from"\]/);
  assert.match(markup, /\[data-date-value="to"\]/);
});

test("모바일 차트 전체 화면 단추와 가로 모드 크기 보정 스타일이 존재한다", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /#root \.fnc-btn-fullscreen\s*\{[^}]*44px/);
  assert.match(html, /orientation:\s*landscape/);
});

test("모바일 하단 내비게이션은 그래프 위의 떠 있는 알약이 아닌 도크이며 전역 resize를 덮어쓰지 않는다", () => {
  const css = readFileSync(new URL("../assets/tokens.css", import.meta.url), "utf8");
  const assets = readFileSync(new URL("../assets/view-assets.js", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 1023px\)[\s\S]*?\.tabbar\s*\{[^}]*bottom:\s*0;[^}]*width:\s*100%/);
  assert.match(css, /\.tabbar a\s*\{ border-radius: 12px; \}/);
  assert.doesNotMatch(assets, /\bonresize\s*=/);
  assert.match(assets, /addEventListener\("resize", floatResizeHandler/);
});

test("320·375·390px 자산 조작부는 한 줄 강제 없이 배치하고 주요 터치 대상으로 44px을 확보한다", () => {
  const css = readFileSync(new URL("../assets/app.css", import.meta.url), "utf8");
  const tokens = readFileSync(new URL("../assets/tokens.css", import.meta.url), "utf8");
  assert.match(css, /\.compare-picks\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(max-width: 360px\)\s*\{[^}]*\.range-top\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /@media \(max-width: 390px\)\s*\{[^}]*\.account > \.panel-h\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(css, /\.compare-pick\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.compare-pick:focus-visible\s*\{/);
  assert.match(css, /\.range-fine > summary\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.range-step-pair button\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.slider input::-webkit-slider-thumb\s*\{[^}]*width:\s*44px;\s*height:\s*44px/);
  assert.match(css, /\.purpose summary\s*\{[^}]*min-height:\s*44px/);
  assert.match(tokens, /@media \(max-width: 1023px\)[\s\S]*?\.tabbar\s*\{[^}]*height:\s*calc\(var\(--tab-h\) \+ env\(safe-area-inset-bottom, 0px\)\)/);
});

test("P2 모바일의 차트 정보와 조작은 분리하고, 320px에서 수치가 잘리지 않게 한다", () => {
  const css = readFileSync(new URL("../assets/app.css", import.meta.url), "utf8");
  const assets = readFileSync(new URL("../assets/view-assets.js", import.meta.url), "utf8");
  const chart = readFileSync(new URL("../assets/chart.js", import.meta.url), "utf8");
  assert.match(css, /\.ln-inspect button\s*\{[^}]*min-width:\s*44px;\s*min-height:\s*48px/);
  assert.match(css, /@media \(pointer: coarse\)\s*\{\s*\.ln-tip\s*\{[^}]*display:\s*none/);
  assert.match(css, /@media \(max-width: 360px\)\s*\{\s*\.perf\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /@media \(max-width: 390px\)\s*\{\s*\.hold-top\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(css, /\.icon-btn\s*\{[^}]*width:\s*44px;\s*height:\s*44px/);
  assert.match(css, /\.chip\s*\{[^}]*height:\s*44px/);
  assert.match(css, /@media \(max-width: 360px\)\s*\{[^\n]*\.top-tools \.sync\s*\{[^}]*display:\s*none/);
  assert.match(css, /@media \(max-width: 390px\)\s*\{[^}]*\.tiles dd\s*\{[^}]*white-space:\s*normal/);
  assert.match(assets, /aria-valuetext="\$\{esc\(dayText\(w.from\)\)\}"/);
  assert.match(assets, /setAttribute\("aria-valuetext", dayText\(t\[a\]\)\)/);
  assert.match(chart, /data-line-step="-1"/);
  assert.match(chart, /aria-live="polite"/);
});

test("P3 시장 차트는 모바일에서 44px 가로축 조작과 종목 빠른 선택을 제공한다", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const chart = readFileSync(new URL("../src/chart-app.jsx", import.meta.url), "utf8");
  assert.match(html, /\.quick-pick\s*\{[^}]*min-height:\s*44px/);
  assert.match(html, /\.chart-mobile-nav button\s*\{[^}]*min-height:\s*44px/);
  assert.match(html, /#root \.fnc-chip\s*\{[^}]*min-height:\s*44px/);
  assert.match(html, /\.market-links a\s*\{[^}]*min-height:\s*44px/);
  assert.match(chart, /legendValues:\s*i\s*\?\s*"crosshair"\s*:\s*"always"/);
  assert.match(chart, /settings:\s*\{\s*navigationButtons:\s*!i\s*\}/);
  assert.match(chart, /chart\.scrollBars\(direction === "past" \? -page : page\)/);
  assert.match(chart, /chart\.scrollToRealtime\(\)/);
  assert.match(chart, /className:\s*"quick-symbols"/);
});
