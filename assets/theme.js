// 판단 일지·시세판·QLD 백테스터 공용 테마. 기본은 블랙 라임.
// 선택은 이 기기(localStorage "sa:theme")에만 저장하고, <html data-palette>로 적용한다. 색 값은 tokens.css(백테스터는 ui.css)에 있다.
// 화면이 깜빡이지 않게 <head>에서 동기로 읽는다. [data-theme-switch] 자리에 지금 테마 단추를 그리고, 누르면 고르는 목록이 열린다.
(function () {
  var KEY = "sa:theme";
  var THEMES = [ // base 60 · panel 30 · accent 10
    { id: "black", label: "블랙 라임", base: "#000000", panel: "#121212", accent: "#c8ff2e" },
    { id: "espresso", label: "에스프레소 민트", base: "#140f0b", panel: "#201913", accent: "#6cf5cf" },
    { id: "storm", label: "스톰 오렌지", base: "#3a3e44", panel: "#17181b", accent: "#ff5f00" },
    { id: "cobalt", label: "코발트 옐로", base: "#18204a", panel: "#0c1029", accent: "#ffd60a" },
  ];
  var byId = function (id) { return THEMES.filter(function (t) { return t.id === id; })[0]; };
  function read() {
    try { var v = localStorage.getItem(KEY); return byId(v) ? v : "black"; }
    catch (e) { return "black"; }
  }
  function apply(id) {
    document.documentElement.setAttribute("data-palette", id);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", byId(id).base);
  }
  function paint(el, t) {
    el.style.setProperty("--dot-base", t.base);
    el.style.setProperty("--dot-panel", t.panel);
    el.style.setProperty("--dot-accent", t.accent);
  }
  function set(id) {
    try { localStorage.setItem(KEY, id); } catch (e) { /* 저장소가 막힌 브라우저 */ }
    apply(id);
    document.querySelectorAll("[data-theme-switch]").forEach(function (el) {
      var t = byId(id), btn = el.querySelector(".theme-btn");
      if (btn) { paint(btn, t); btn.setAttribute("aria-label", "테마: " + t.label); }
      el.querySelectorAll("[role=menuitemradio]").forEach(function (b) { b.setAttribute("aria-checked", String(b.dataset.palette === id)); });
    });
    window.dispatchEvent(new CustomEvent("sa-theme", { detail: id }));
  }
  function mount(el) {
    if (!el || el.dataset.mounted) return;
    el.dataset.mounted = "1";
    var cur = byId(read());
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-dot theme-btn";
    btn.setAttribute("aria-haspopup", "menu");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "테마: " + cur.label);
    paint(btn, cur);
    var menu = document.createElement("div");
    menu.className = "theme-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "테마");
    menu.hidden = true;
    THEMES.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "menuitemradio");
      b.dataset.palette = t.id;
      b.setAttribute("aria-checked", String(t.id === cur.id));
      paint(b, t);
      b.innerHTML = '<span class="theme-dot" aria-hidden="true"></span><span class="theme-name"></span><span class="theme-bar" aria-hidden="true"><i></i><i></i><i></i></span>';
      b.querySelector(".theme-name").textContent = t.label;
      b.addEventListener("click", function () { set(t.id); close(); btn.focus(); });
      menu.appendChild(b);
    });
    function open() { menu.hidden = false; btn.setAttribute("aria-expanded", "true"); (menu.querySelector("[aria-checked=true]") || menu.firstChild).focus(); }
    function close() { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); }
    btn.addEventListener("click", function () { menu.hidden ? open() : close(); });
    document.addEventListener("click", function (e) { if (!menu.hidden && !el.contains(e.target)) close(); });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !menu.hidden) { close(); btn.focus(); }
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !menu.hidden) {
        var items = [].slice.call(menu.children), i = items.indexOf(document.activeElement);
        items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
        e.preventDefault();
      }
    });
    el.appendChild(btn);
    el.appendChild(menu);
  }
  var css = document.createElement("style");
  css.textContent =
    "[data-theme-switch]{position:relative;display:inline-flex;align-items:center}" +
    ".theme-dot{display:inline-block;width:24px;height:24px;border-radius:50%;padding:0;flex:none;border:1px solid color-mix(in srgb,var(--dot-accent) 40%,transparent);" +
    "background:radial-gradient(circle at 50% 50%,var(--dot-accent) 0 30%,var(--dot-base) 33%)}" +
    ".theme-btn{cursor:pointer;box-shadow:0 0 0 2px var(--dot-base),0 0 0 4px var(--dot-accent)}" +
    ".theme-menu{position:absolute;right:-6px;top:calc(100% + 10px);z-index:60;display:grid;gap:2px;min-width:244px;padding:6px;border-radius:16px;" +
    "background:color-mix(in srgb,var(--panel,#121212) 92%,transparent);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);" +
    "box-shadow:inset 0 0 0 1px var(--line,#262626),0 16px 40px -10px rgba(0,0,0,.75)}" +
    ".theme-menu[hidden]{display:none}" +
    ".theme-menu button{display:grid;grid-template-columns:24px 1fr 44px;align-items:center;gap:10px;padding:9px 10px;border:0;border-radius:11px;background:none;" +
    "color:var(--ink,#f2f2f2);font:inherit;font-size:13.5px;font-weight:600;text-align:left;white-space:nowrap;cursor:pointer}" +
    ".theme-menu button:hover,.theme-menu button:focus-visible{background:var(--raised,#1c1c1c);outline:none}" +
    ".theme-menu button[aria-checked=true]{background:var(--raised,#1c1c1c);box-shadow:inset 0 0 0 1px var(--dot-accent)}" +
    ".theme-bar{display:flex;height:10px;border-radius:5px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}" +
    ".theme-bar i{display:block}.theme-bar i:nth-child(1){flex:6;background:var(--dot-base)}.theme-bar i:nth-child(2){flex:3;background:var(--dot-panel)}.theme-bar i:nth-child(3){flex:1;background:var(--dot-accent)}";
  document.head.appendChild(css);
  apply(read());
  window.saTheme = { themes: THEMES, get: read, set: set, mount: mount };
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-theme-switch]").forEach(mount);
  });
})();
