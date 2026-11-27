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
