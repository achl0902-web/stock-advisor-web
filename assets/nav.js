// 판단 일지·시세판 공용 화면 이동 탭(홈 = 시세판). <nav id="tabbar" data-current="sise"> 바로 뒤에서 동기로 그린다.
// 판단 일지 안에서는 해시만 바꾸고(새로 읽지 않음), 시세판에서는 판단 일지로 넘어간다.
// 가족 보기: ?view=family로 한 번 들어오면 이 기기에서 계속(주 계좌·코인 자산과 시세만). ?view=all로 되돌린다.
(function () {
  try {
    var v = new URLSearchParams(location.search).get("view");
    if (v === "family") localStorage.setItem("sa:view", "family");
    if (v === "all") localStorage.removeItem("sa:view");
    window.saFamily = localStorage.getItem("sa:view") === "family";
  } catch (e) { window.saFamily = false; }
  if (window.saFamily) document.documentElement.classList.add("family");
})();
(function () {
  var el = document.getElementById("tabbar");
  if (!el) return;
  var here = el.dataset.current || "";
  // 판단 일지 첫 주소(해시 없음)는 홈(시세판)으로
  if (here === "log" && !location.hash.replace(/^#\/?/, "")) { location.replace("sise.html" + location.search); return; }
  var pre = here === "sise" ? "./" : "";
  var TABS = [
    ["sise", "홈", "sise.html", '<path d="M7 4.5v3M7 14.5v5M17 4.5v5M17 16.5v3"/><rect x="5" y="7.5" width="4" height="7" rx="1"/><rect x="15" y="9.5" width="4" height="7" rx="1"/>'],
    ["assets", "자산", pre + "#/assets", '<circle cx="12" cy="12" r="8"/><path d="M12 4v8l6.2 5"/>'],
    ["log", "기록", pre + "#/log", '<path d="M8.5 7h10.5M8.5 12h10.5M8.5 17h10.5"/><path d="M4.5 7h.01M4.5 12h.01M4.5 17h.01" stroke-width="2.4"/>'],
  ];
  if (window.saFamily) TABS = TABS.filter(function (t) { return t[0] === "assets" || t[0] === "sise"; });
  el.style.setProperty("--tabs", TABS.length);
  el.innerHTML = TABS.map(function (t) {
    return '<a href="' + t[2] + '" data-tab="' + t[0] + '"' + (t[0] === here ? ' aria-current="page"' : "") +
      '><svg viewBox="0 0 24 24" aria-hidden="true">' + t[3] + "</svg><span>" + t[1] + "</span></a>";
  }).join("");
})();
