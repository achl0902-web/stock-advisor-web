import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("자산 날짜 선택기가 iPhone 폭에서 한 줄 한 칸으로 배치되고, 입력 폭을 제한한다", () => {
  const css = readFileSync(new URL("../assets/app.css", import.meta.url), "utf8");
  assert.match(css, /\.range-inputs input\s*\{[^}]*box-sizing:\s*border-box;[^}]*max-width:\s*100%/);
  assert.match(css, /@media \(max-width:\s*560px\)\s*\{\s*\.range-inputs\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test("모바일 차트 전체 화면 단추와 가로 모드 크기 보정 스타일이 존재한다", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /#root \.fnc-btn-fullscreen\s*\{[^}]*44px/);
  assert.match(html, /orientation:\s*landscape/);
});
