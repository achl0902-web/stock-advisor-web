// 판단 일지·시세판 공용 화면 이동 탭. <nav id="tabbar" data-current="sise"> 바로 뒤에서 동기로 그린다.
// 판단 일지 안에서는 해시만 바꾸고(새로 읽지 않음), 시세판에서는 판단 일지로 넘어간다.
(function () {
  var el = document.getElementById("tabbar");
  if (!el) return;
  var here = el.dataset.current || "";
  var pre = here === "sise" ? "./" : "";
  var TABS = [
    ["home", "오늘", pre + "#/", '<rect x="4" y="4" width="16" height="16" rx="4.5"/><path d="M8.5 12.3l2.4 2.4 4.6-5.2"/>'],
    ["log", "기록", pre + "#/log", '<path d="M8.5 7h10.5M8.5 12h10.5M8.5 17h10.5"/><path d="M4.5 7h.01M4.5 12h.01M4.5 17h.01" stroke-width="2.4"/>'],
    ["assets", "자산", pre + "#/assets", '<circle cx="12" cy="12" r="8"/><path d="M12 4v8l6.2 5"/>'],
    ["sise", "시세", "sise.html", '<path d="M7 4.5v3M7 14.5v5M17 4.5v5M17 16.5v3"/><rect x="5" y="7.5" width="4" height="7" rx="1"/><rect x="15" y="9.5" width="4" height="7" rx="1"/>'],
  ];
  el.innerHTML = TABS.map(function (t) {
    return '<a href="' + t[2] + '" data-tab="' + t[0] + '"' + (t[0] === here ? ' aria-current="page"' : "") +
      '><svg viewBox="0 0 24 24" aria-hidden="true">' + t[3] + "</svg><span>" + t[1] + "</span></a>";
  }).join("");
})();
