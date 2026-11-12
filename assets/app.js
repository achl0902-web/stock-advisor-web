// 판단 일지: 연결·불러오기·화면 이동. 화면은 view-*.js, 데이터 모델은 store.js, 공통 조각은 ui.js.
import { Repo, ApiError, settings, fetchStrategyStatus } from "./data.js";
import { state, loadModel, FIRST_PAGE } from "./store.js";
import { view, esc, ago, icon, sealChars, note } from "./ui.js";
import { renderHome } from "./view-home.js";
import { renderRuns, renderScore, renderRun } from "./view-log.js";
import { renderAccounts, renderLongTerm, renderLevels, renderEtf } from "./view-assets.js";

const DEFAULT_REPO = "achl0902-web/stock-advisor";
const syncEl = document.getElementById("sync");

// 주소(#/탭/갈래) → [아래 탭, 그리는 함수]. 예전 주소(#/runs·#/score·#/accounts·#/etf)도 받는다.
const ROUTES = {
  "": ["home", renderHome],
  "log": ["log", renderRuns, "narrow"], "log/score": ["log", renderScore, "narrow"],
  "runs": ["log", renderRuns, "narrow"], "score": ["log", renderScore, "narrow"],
  "assets": ["assets", renderAccounts], "assets/long": ["assets", renderLongTerm], "assets/levels": ["assets", renderLevels], "assets/etf": ["assets", renderEtf],
  "accounts": ["assets", renderAccounts], "etf": ["assets", renderEtf],
};

function setTab(tab) {
  document.querySelectorAll("#tabbar a").forEach(a => a.dataset.tab === tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
}
const fail = e => { view.innerHTML = note(e?.message || String(e)); };

/* ---------- 화면 이동 ---------- */
const scrolls = new Map(); // 목록에서 상세로 갔다 돌아오면 보던 자리로
let lastPath = null;
function route({ keep = false } = {}) {
  const path = location.hash.replace(/^#\/?/, "").replace(/\/$/, "");
  if (lastPath != null) scrolls.set(lastPath, scrollY);
  const y = keep ? scrollY : (lastPath?.startsWith("run/") && scrolls.get(path)) || 0;
  lastPath = path;
  if (path === "settings") { setTab(null); document.body.classList.add("narrow"); renderSetup(); scrollTo(0, 0); return; }
  if (!state.model) return;
  const [tab, render, width] = path.startsWith("run/") ? ["log", () => renderRun(decodeURIComponent(path.slice(4)))] : ROUTES[path] || ROUTES[""];
  const draw = () => {
    setTab(tab);
    document.body.classList.toggle("narrow", !!width); // 목록 화면은 넓은 모니터에서도 읽기 좋은 폭으로
    try { Promise.resolve(render()).catch(fail); } catch (e) { fail(e); }
    scrollTo(0, y);
  };
  // 화면이 바뀔 때 짧게 겹쳐 넘긴다(지원하는 브라우저, 움직임 줄이기를 켜지 않았을 때만)
  if (!keep && document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(draw);
  else draw();
}

/* ---------- 연결 설정 ---------- */
function renderSetup(message) {
  const cur = settings.load();
  document.body.classList.toggle("no-token", !cur?.token);
  view.innerHTML = `
    <section class="setup">
      ${sealChars(["판", "단", "일", "지"], "up", "판단 일지")}
      <h1>저장소 연결</h1>
      <p class="lede">이 페이지에는 데이터가 없습니다. 비공개 <b>stock-advisor</b> 저장소를 이 기기에서만 읽어 와 보여 줍니다. 토큰은 이 브라우저에만 저장되고 GitHub 말고는 어디로도 보내지 않습니다.</p>
      ${message ? note(message) : ""}
      <form id="setup-form" autocomplete="off">
        <label>저장소<input name="repo" value="${esc(cur ? `${cur.owner}/${cur.repo}` : DEFAULT_REPO)}" spellcheck="false" autocapitalize="off"></label>
        <label>읽기 전용 토큰<input name="token" type="password" placeholder="github_pat_…" value="${esc(cur?.token || "")}" spellcheck="false" autocapitalize="off" required></label>
        <button class="btn" type="submit">연결하기</button>
      </form>
      <details class="panel howto" ${cur ? "" : "open"}>
        <summary>토큰 만드는 법</summary>
        <ol>
          <li>GitHub에서 <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">새 fine-grained 토큰 만들기</a>를 엽니다.</li>
          <li>이름은 아무거나(예: 판단 일지), 만료는 원하는 기간으로 둡니다.</li>
          <li>Repository access에서 <b>Only select repositories</b>를 고르고 stock-advisor 하나만 넣습니다.</li>
          <li>Repository permissions에서 <b>Contents: Read-only</b>를 켭니다. 시세 탭에서 새로 수집하려면 <b>Actions: Read and write</b>도 켭니다. Metadata 읽기는 자동으로 붙습니다.</li>
          <li>만든 토큰을 위 칸에 붙여 넣고 연결하기를 누릅니다.</li>
        </ol>
        <p class="hint">이 토큰으로는 저장소 코드를 바꿀 수 없고, Actions 권한으로는 이미 있는 수집 작업만 실행합니다. 기기를 잃어버리면 GitHub에서 토큰을 지우면 됩니다.</p>
      </details>
      ${cur ? `<button class="btn btn-ghost btn-danger" type="button" id="forget">이 기기에서 토큰 지우기</button>` : ""}
    </section>`;
  document.getElementById("setup-form").addEventListener("submit", e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const [owner, repo] = String(f.get("repo")).trim().split("/");
    const token = String(f.get("token")).trim();
    if (!owner || !repo || !token) return;
    settings.save({ owner, repo, token });
    state.model = null;
    lastPath = null;
    if (location.hash !== "#/") location.hash = "#/";
    boot();
  });
  document.getElementById("forget")?.addEventListener("click", () => {
    settings.clear();
    Object.assign(state, { repo: null, model: null, strategy: null });
    setSync("연결 안 됨", "off");
    renderSetup("토큰을 지웠습니다.");
  });
}

/* ---------- 불러오기 ---------- */
// 상태 점: busy는 깜빡임, off는 연결 안 됨·실패(회색)
function setSync(text, dot = "") {
  syncEl.innerHTML = `<i class="${dot}"></i>${esc(text)}`;
}

let booting = null;
async function boot() {
  if (booting) return booting;
  const cfg = settings.load();
  document.body.classList.toggle("no-token", !cfg?.token);
  if (!cfg?.token) { setSync("연결 안 됨", "off"); renderSetup(); return; }
  state.repo = new Repo(cfg);
  const first = !state.model;
  if (first) view.innerHTML = `<div class="loading">${sealChars(["읽", "는", "중", "…"], "flat", "불러오는 중")}<p class="hint" id="progress">저장소를 읽는 중…</p></div>`;
  setSync("불러오는 중", "busy");
  booting = (async () => {
    try {
      const onProgress = (n, total) => { const el = document.getElementById("progress"); if (el && total) el.textContent = `판단 기록 ${n}/${total}`; };
      // 새로 불러올 때는 이미 펼쳐 둔 만큼 다시 읽는다(바뀐 파일만 받고 나머지는 캐시)
      const count = Math.max(FIRST_PAGE, state.model?.shown || 0);
      const [model, strategy] = await Promise.all([loadModel(state.repo, onProgress, count), fetchStrategyStatus()]);
      Object.assign(state, { model, strategy, loadedAt: Date.now() });
      const at = new Date(model.head.date);
      setSync(`${ago(at)} 갱신`);
      syncEl.title = `${model.head.message} (${at.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })})`;
      if (first || lastPath !== "settings") route({ keep: !first });
    } catch (e) {
      setSync("연결 실패", "off");
      if (e instanceof ApiError && [401, 403, 404].includes(e.status)) renderSetup(e.message);
      else {
        view.innerHTML = `${note(e?.message || String(e))}<button class="btn" type="button" id="retry">다시 시도</button>`;
        document.getElementById("retry").addEventListener("click", boot);
      }
    } finally { booting = null; }
  })();
  return booting;
}

/* ---------- 새 버전 확인 ---------- */
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

window.addEventListener("hashchange", () => route());
document.getElementById("refresh").innerHTML = icon("refresh");
document.getElementById("refresh").addEventListener("click", boot);
document.getElementById("settings-link").innerHTML = icon("gear");
document.addEventListener("visibilitychange", () => {
  // 오래 켜 두었다 다시 열면 새 커밋을 확인
  if (document.visibilityState === "visible") checkUpdate(); // 다시 켠 사이 새로 배포됐을 수 있다
  if (document.visibilityState === "visible" && state.model && Date.now() - state.loadedAt > 10 * 60 * 1000) boot();
});
boot();
