// 시세판 홈 패널: 시세 띠 바로 아래에 QLD 전략, 가까운 관심가, 주요 일정(오늘 앞뒤 30일, stock-advisor reports/events.json).
// 판단 기록은 읽지 않는다(파일 몇 개만 바로 받는다). 토큰이 없으면 아무것도 그리지 않는다(시세판이 연결 안내를 띄운다).
// 가족 보기: 바이오·퇴직연금 관심가와 공시·ETF 일정은 뺀다.
import { Repo, settings, fetchStrategyStatus } from "./data.js";
import { state, levelsModel, levelItems, pickBoard, todayKST } from "./store.js";
import { nearPanel, strategyPanel } from "./view-home.js";
import { esc, head, dday } from "./ui.js";

const el = document.getElementById("home");
const FAMILY = !!window.saFamily;
const MINE = new Set(["disclosure", "etf"]); // 내 계좌 일정(가족 보기에서 뺀다)
const TAG = { fomc: "FOMC", cpi: "물가", jobs: "고용", earnings: "실적", holiday: "휴장", disclosure: "공시", etf: "ETF" };
const WD = ["일", "월", "화", "수", "목", "금", "토"];

const when = x => `${x.date.slice(5).replace("-", "/")}(${WD[new Date(`${x.date}T12:00:00Z`).getUTCDay()]})${x.time ? ` ${x.time}` : ""}`;

function row(x, today) {
  const title = x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a>` : esc(x.title);
  return `<li class="${x.date < today ? "done" : x.date === today ? "due" : ""}">
    <span class="dday fig">${x.date < today ? esc(x.date.slice(5).replace("-", "/")) : dday(x.date, today)}</span>
    <span class="dates-main"><b>${title}</b><small><span class="tag tag-${esc(x.kind)}">${esc(TAG[x.kind] || x.kind)}</span>${esc(when(x))}${x.sub ? ` · ${esc(x.sub)}` : ""}</small></span>
  </li>`;
}

const SHOW = 6; // 폰에서 차트가 너무 밀리지 않게 다가오는 일정은 이만큼만 펼친다
const fold = (label, xs, today) => xs.length ? `<details class="past"><summary>${esc(label)}</summary><ul class="dates">${xs.map(x => row(x, today)).join("")}</ul></details>` : "";

function eventsPanel(doc) {
  if (!doc?.items) return "";
  const today = todayKST();
  const items = doc.items.filter(x => !(FAMILY && MINE.has(x.kind)));
  const next = items.filter(x => x.date >= today), past = items.filter(x => x.date < today).reverse();
  return `<section class="panel events">
    ${head("주요 일정", `<span class="hint">앞뒤 30일 · 한국 시각</span>`)}
    <ul class="dates">${next.slice(0, SHOW).map(x => row(x, today)).join("") || `<li><p class="hint">다가오는 일정이 없습니다.</p></li>`}</ul>
    ${fold(`이후 ${next.length - SHOW}건 더`, next.slice(SHOW), today)}
    ${fold(`지난 30일 ${past.length}건`, past, today)}
  </section>`;
}

async function main() {
  const cfg = settings.load();
  if (!el || !cfg?.token) return;
  const repo = new Repo(cfg);
  const [events, accounts, alerts, alertState, board, strategy] = await Promise.all([
    repo.raw("reports/events.json"),
    repo.raw("config/accounts.json"),
    repo.raw("config/price_alerts.json"),
    repo.raw("reports/alerts_state.json"),
    repo.board("market--snapshot.json", pickBoard),
    fetchStrategyStatus(),
  ]);
  Object.assign(state, { model: levelsModel({ accounts, alerts, alertState, board }), strategy });
  const near = levelItems().filter(it => !(FAMILY && ["bio", "pension"].includes(it.account)));
  el.innerHTML = `${strategyPanel()}${nearPanel(near, "./")}${eventsPanel(events)}`;
}

main().catch(e => { if (el) el.innerHTML = `<p class="hint">홈 패널을 불러오지 못했습니다: ${esc(e?.message || String(e))}</p>`; });
