// 판단 일지·시세판 공용 테마. 기본은 블랙 라임, 에스프레소 민트를 고를 수 있다.
// 선택은 이 기기(localStorage "sa:theme")에만 저장하고, <html data-palette>로 적용한다.
// 화면이 깜빡이지 않게 <head>에서 동기로 읽는다. [data-theme-switch] 자리에 고르기 버튼을 그린다.
(function () {
  var KEY = "sa:theme";
  var THEMES = [
    { id: "black", label: "블랙 라임", base: "#000000", accent: "#c8ff2e" },
    { id: "espresso", label: "에스프레소 민트", base: "#140f0b", accent: "#6cf5cf" },
  ];
  function read() {
    try { var v = localStorage.getItem(KEY); return THEMES.some(function (t) { return t.id === v; }) ? v : "black"; }
    catch (e) { return "black"; }
  }
  function apply(id) {
    document.documentElement.setAttribute("data-palette", id);
    var meta = document.querySelector('meta[name="theme-color"]');
    var t = THEMES.filter(function (x) { return x.id === id; })[0];
    if (meta && t) meta.setAttribute("content", t.base);
  }
  function set(id) {
    try { localStorage.setItem(KEY, id); } catch (e) { /* 저장소가 막힌 브라우저 */ }
    apply(id);
    document.querySelectorAll("[data-theme-switch] button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.palette === id));
    });
    window.dispatchEvent(new CustomEvent("sa-theme", { detail: id }));
  }
  function mount(el) {
    if (!el || el.dataset.mounted) return;
    el.dataset.mounted = "1";
    el.setAttribute("role", "group");
    el.setAttribute("aria-label", "테마");
    var cur = read();
    THEMES.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "theme-dot";
      b.dataset.palette = t.id;
      b.title = t.label;
      b.setAttribute("aria-label", t.label);
      b.setAttribute("aria-pressed", String(t.id === cur));
      b.style.setProperty("--dot-base", t.base);
      b.style.setProperty("--dot-accent", t.accent);
      b.addEventListener("click", function () { set(t.id); });
      el.appendChild(b);
    });
  }
  var css = document.createElement("style");
  css.textContent =
    "[data-theme-switch]{display:inline-flex;gap:6px;align-items:center}" +
    ".theme-dot{width:24px;height:24px;border-radius:50%;padding:0;cursor:pointer;border:1px solid color-mix(in srgb,var(--dot-accent) 40%,transparent);" +
    "background:radial-gradient(circle at 50% 50%,var(--dot-accent) 0 30%,var(--dot-base) 33%)}" +
    ".theme-dot[aria-pressed=true]{box-shadow:0 0 0 2px var(--dot-base),0 0 0 4px var(--dot-accent)}";
  document.head.appendChild(css);
  apply(read());
  window.saTheme = { themes: THEMES, get: read, set: set, mount: mount };
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-theme-switch]").forEach(mount);
  });
})();
