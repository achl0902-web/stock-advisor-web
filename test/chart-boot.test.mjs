import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

// 별도 GitHub 토큰 없이도 컴파일된 React 앱이 부팅되고 설정 안내를 표시해야 한다.
// 이 테스트는 소스가 아닌 실제 배포용 assets/sise.js를 실행한다.
test("재생성된 시세판 번들은 초기 화면에서 런타임 오류 없이 부팅한다", async () => {
  const errors = [];
  const console = new VirtualConsole();
  console.on("jsdomError", error => errors.push(error.message));
  const dom = new JSDOM("<!doctype html><html lang='ko'><body><div id='root'></div></body></html>", {
    url: "https://example.test/",
    pretendToBeVisual: true,
    runScripts: "outside-only",
    virtualConsole: console,
  });
  const { window } = dom;
  window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  window.saFamily = false;
  try {
    const bundle = readFileSync(new URL("../assets/sise.js", import.meta.url), "utf8");
    window.eval(bundle);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.match(window.document.querySelector("#root").textContent, /시세판/);
    assert.match(window.document.querySelector("#root").textContent, /토큰/);
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
