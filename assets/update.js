// 판단 일지·홈 공용: 새로 배포된 화면 파일이 있으면 한 번 다시 연다.
// GitHub Pages는 파일을 10분까지 캐시하게 해서, 배포 직후 열면 예전 화면 파일이 섞여 뜬다.
// 열 때마다 이 페이지가 쓴 파일(html·js·css)을 서버에 다시 물어보고, 하나라도 바뀌었으면 새 파일로 한 번 다시 연다.
async function checkUpdate() {
  try {
    const own = [location.pathname, ...performance.getEntriesByType("resource").map(e => e.name)
      .filter(u => u.startsWith(location.origin) && /\.(js|css)(\?|$)/.test(u))];
    const files = [...new Set(own)];
    const changed = (await Promise.all(files.map(async u => {
      const [was, now] = await Promise.all([fetch(u, { cache: "force-cache" }), fetch(u, { cache: "no-cache" })]);
      return was.ok && now.ok && (await was.text()) !== (await now.text());
    }))).some(Boolean);
    if (!changed) return;
    const last = +sessionStorage.getItem("sa:reloaded") || 0;
    if (Date.now() - last < 60_000) return; // 계속 다시 여는 일이 없게
    sessionStorage.setItem("sa:reloaded", String(Date.now()));
    await Promise.all(files.map(u => fetch(u, { cache: "reload" }))); // 캐시를 새 파일로 채운 뒤
    location.reload();
  } catch { /* 확인 못 하면 다음에 */ }
}
addEventListener("load", () => setTimeout(checkUpdate, 1500));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkUpdate(); }); // 다시 켠 사이 새로 배포됐을 수 있다
