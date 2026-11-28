// 오늘·자산·시장·기록 공용 최상위 메뉴. 기존 링크는 유지하면서 첫 주소는 오늘로 보낸다.
// 판단 일지 안에서는 해시만 바꾸고(새로 읽지 않음), 시세판에서는 판단 일지로 넘어간다.
// 가족 보기: 한 번 설정하면 이 기기의 표시 모드로 유지한다.
// URL의 view=all만으로 이 상태를 해제하지 않는다. (권한 분리 기능은 아님.)
(function () {
  try {
    var v = new URLSearchParams(location.search).get("view");
    if (v === "family") localStorage.setItem("sa:view", "family");
    window.saFamily = localStorage.getItem("sa:view") === "family";
  } catch (e) { window.saFamily = new URLSearchParams(location.search).get("view") === "family"; }
  if (window.saFamily) document.documentElement.classList.add("family");
})();
(function () {
  var el = document.getElementById("tabbar");
  if (!el) return;
  var page = el.dataset.current || ""; // "sise"(시장 차트) 또는 "log"(오늘·자산·기록 등)
  // 기본 주소는 오늘. 공유용 가족 보기는 자산부터 열고, 명시적인 #market은 시세판 그대로 둔다.
  if (page === "sise" && (!location.hash || location.hash === "#/")) {
    location.replace("log.html" + location.search + (window.saFamily ? "#/assets" : "#/today"));
    return;
  }
  if (page === "sise" && location.hash !== "#market") { location.replace("log.html" + location.search + location.hash); return; }
  // 판단 일지는 주소로 탭을 고른다(데이터를 읽기 전에 그리므로 처음부터 맞는 탭에 불이 켜지게)
  var here = page === "log" ? (/^#\/(assets(\/(long|pension|crypto))?\/?$|accounts)/.test(location.hash) ? "assets"
    : /^#\/today\/?$/.test(location.hash) ? "today"
    : /^#\/(market\/|log\/(levels|etf)|assets\/(levels|etf)|etf)/.test(location.hash) ? "sise" : "log") : page;
  // 저장소 접근이 제한되어 localStorage가 막힌 브라우저에서도 공유 모드를 유지한다.
  var familyQuery = window.saFamily ? "?view=family" : "";
  var pre = page === "sise" ? "log.html" + familyQuery : "";
  var TABS = [
    ["today", "오늘", pre + "#/today", '<path d="M3 10.5 12 3l9 7.5V21h-7v-7h-4v7H3z"/>'],
    ["assets", "자산", pre + "#/assets", '<circle cx="12" cy="12" r="8"/><path d="M12 4v8l6.2 5"/>'],
    ["sise", "시장", "./index.html" + familyQuery + "#market", '<path d="M7 4.5v3M7 14.5v5M17 4.5v5M17 16.5v3"/><rect x="5" y="7.5" width="4" height="7" rx="1"/><rect x="15" y="9.5" width="4" height="7" rx="1"/>'],
    ["log", "기록", pre + "#/log", '<path d="M8.5 7h10.5M8.5 12h10.5M8.5 17h10.5"/><path d="M4.5 7h.01M4.5 12h.01M4.5 17h.01" stroke-width="2.4"/>'],
  ];
  if (window.saFamily) TABS = TABS.filter(function (t) { return t[0] === "assets" || t[0] === "sise"; });
  el.style.setProperty("--tabs", TABS.length);
  el.innerHTML = TABS.map(function (t) {
    return '<a href="' + t[2] + '" data-tab="' + t[0] + '"' + (t[0] === here ? ' aria-current="page"' : "") +
      '><svg viewBox="0 0 24 24" aria-hidden="true">' + t[3] + "</svg><span>" + t[1] + "</span></a>";
  }).join("");
})();
