// 화면이 쓰는 데이터 모델. 저장소 파일을 읽어 판단·계좌·시세·관심가를 한 모양으로 맞춘다.
// 아래 순수 함수(mergeLevels·nearest·upcoming·valueAccount)는 test/store.test.mjs가 확인한다.

export const DEC = {
  buy: { label: "매수", mark: "매수", seal: ["매", "수"], tone: "up", group: "buy" },
  split_buy: { label: "분할 매수", mark: "분할", seal: ["분", "할", "매", "수"], tone: "up", group: "buy" },
  hold: { label: "관망", mark: "관망", seal: ["관", "망"], tone: "flat", group: "hold" },
  trim: { label: "비중 축소", mark: "축소", seal: ["축", "소"], tone: "down", group: "sell" },
  sell: { label: "매도", mark: "매도", seal: ["매", "도"], tone: "down", group: "sell" },
};
export const ACCOUNT_ORDER = ["main", "bio", "pension", "crypto"];
const ACCOUNT_FALLBACK = { main: "주 계좌", bio: "바이오 계좌", pension: "퇴직연금", crypto: "크립토 계좌" };
const ACCOUNT_SHORT = { main: "주 계좌", bio: "바이오", pension: "퇴직연금", crypto: "크립토" };

export const state = { repo: null, model: null, strategy: null, loadedAt: 0 };

const KST = { timeZone: "Asia/Seoul" };
export const todayKST = () => new Date().toLocaleDateString("sv-SE", KST);

/* ---------- 큰 파일에서 화면에 쓰는 부분만 추리기 (data.js가 이 결과만 캐시한다) ---------- */
const sentences = (s, n) => String(s || "").split(/(?<=다\.)\s+/).slice(0, n).join(" ");
const pickBrief = b => ({
  meta: b.meta && { symbol: b.meta.symbol, name: b.meta.name, market: b.meta.market, currency: b.meta.currency, exchange: b.meta.exchange, collected_at: b.meta.collected_at },
  price: b.quote?.price ?? b.technical?.price_used ?? null,
  quote_at: b.quote?.asof ?? null,
  fx: b.fx?.usdkrw ?? null,
  portfolio: b.portfolio && {
    total_krw: b.portfolio.total_krw, cash_krw: b.portfolio.cash_krw, cash_usd: b.portfolio.cash_usd,
    effective_exposure_pct: b.portfolio.effective_exposure_pct,
    holdings: (b.portfolio.holdings || []).map(h => ({ symbol: h.symbol, weight_pct: h.weight_pct })),
  },
});
const pickDecision = d => ({ decision: d.decision, confidence: d.confidence, gist: sentences(d.rationale, 2) });
const pickAccount = a => ({ id: a.id, purpose: a.purpose, holdings: (a.holdings || []).map(h => ({ symbol: h.symbol })) });
const pickBoard = s => {
  const quotes = {};
  for (const w of s.watch || []) quotes[w.code] = { price: w.last, chg: w.chg_pct, name: w.name, currency: w.market === "US" ? "USD" : "KRW" };
  let fx = null;
  for (const m of s.macro || []) {
    if (m.sym === "KRW=X") fx = m.last;
    if (m.sym === "BTC-KRW") quotes.BTC = { price: m.last, chg: m.chg_pct, name: m.name, currency: "KRW" };
  }
  return { asof: s.asof, fx, quotes };
};

function parseRunTime(id) {
  const m = id.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/);
  return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+09:00`) : null;
}

function accountOf(run, accounts) {
  const entries = Object.entries(accounts || {}).filter(([, v]) => v && typeof v === "object" && Array.isArray(v.holdings));
  if (run.account?.id && accounts?.[run.account.id]) return run.account.id;
  if (run.account?.holdings) {
    const syms = new Set(run.account.holdings.map(h => h.symbol));
    let best = null, bestScore = 0;
    for (const [k, v] of entries) {
      const s = v.holdings.filter(h => syms.has(h.symbol)).length / Math.max(syms.size, v.holdings.length);
      if (s > bestScore) { best = k; bestScore = s; }
    }
    if (best) return best;
    const p = run.account.purpose || "";
    if (p.includes("퇴직연금")) return "pension";
    if (p.includes("바이오")) return "bio";
  }
  for (const [k, v] of entries) if (v.holdings.some(h => h.symbol === run.symbol)) return k;
  return "main";
}

// 판단은 최근 것부터 나눠 읽는다. 처음 FIRST_PAGE건, "더 불러오기"마다 MORE_PAGE건.
export const FIRST_PAGE = 20;
export const MORE_PAGE = 50;

async function loadRun(repo, id) {
  const p = f => `runs/${id}/${f}`;
  const [brief, dec, plan, account, pm] = await Promise.all([
    repo.json(p("brief.json"), "brief1", pickBrief),
    repo.json(p("final_decision.json"), "dec1", pickDecision),
    repo.json(p("plan.json")),
    repo.has(p("account.json")) ? repo.json(p("account.json"), "acc1", pickAccount) : null,
    repo.has(p("premortem.json")) ? repo.json(p("premortem.json"), "pm1", x => ({ verdict: x.verdict })) : null,
  ]);
  const meta = brief?.meta || {};
  const at = meta.collected_at ? new Date(meta.collected_at) : parseRunTime(id);
  return {
    id, at, brief, dec, plan, account, premortem: pm,
    symbol: meta.symbol || id.split("-").slice(2).join("-"),
    name: meta.name || null,
    exchange: meta.exchange,
    currency: meta.currency || (meta.market === "KR" ? "KRW" : "USD"),
    price: brief?.price ?? plan?.price_now ?? null,
    quoteAt: brief?.quote_at ? new Date(brief.quote_at) : at,
  };
}

// 종목별 가장 최근 시세만 남긴다: 판단 시점, 가격 알림 점검, 시세판 수집 중 가장 늦은 것
function putQuote(quotes, sym, q) {
  if (q.price != null && (!quotes[sym] || (q.at && q.at > quotes[sym].at))) quotes[sym] = q;
}

// 새로 읽은 판단을 모델에 넣는다. 이름은 시세판·알림 설정의 한글 이름이 있으면 그것을 쓴다.
function absorb(m, runs) {
  for (const r of runs) {
    if (m.byId.has(r.id)) continue;
    if (r.name && !m.names[r.symbol]) m.names[r.symbol] = r.name;
    r.name = m.names[r.symbol] || r.symbol;
    r.accountKey = accountOf(r, m.accounts);
    putQuote(m.quotes, r.symbol, { price: r.price, at: r.quoteAt, currency: r.currency });
    m.byId.set(r.id, r);
  }
  m.runs = [...m.byId.values()].sort((a, b) => b.id.localeCompare(a.id));
}

export async function loadModel(repo, onProgress = () => {}, count = FIRST_PAGE) {
  const head = await repo.index();
  const ids = [...new Set(repo.list("runs/").map(p => p.split("/")[1]))].filter(id => id && !/test/i.test(id)).sort().reverse();
  // 판단까지 간 실행만 목록에 둔다(데이터 수집만 한 실행, 궁금해서 돌린 참고용 판단은 뺀다). 파일 목록만 보면 알 수 있어 읽지 않는다.
  const finished = ids.filter(id => repo.has(`runs/${id}/final_decision.json`));
  const isRef = id => repo.has(`runs/${id}/reference.json`);
  const doneIds = finished.filter(id => !isRef(id));
  const [accounts, alerts, alertState, scorecard, notes, openOrders, board, worth] = await Promise.all([
    repo.json("config/accounts.json"),
    repo.json("config/price_alerts.json"),
    repo.json("reports/alerts_state.json"),
    repo.json("reports/scorecard.json"),
    repo.json("config/scorecard_notes.json"),
    repo.json("config/open_orders.json"),
    repo.board("market--snapshot.json", "board1", pickBoard),
    repo.board("networth--history.json"),
  ]);
  const first = doneIds.slice(0, count);
  let loaded = 0;
  onProgress(0, first.length);
  const runs = await Promise.all(first.map(id => loadRun(repo, id).then(r => (onProgress(++loaded, first.length), r))));
  // 이름: 시세판 < 알림 설정 순으로 덮어쓴다(뒤쪽이 한글 이름). 판단 기록의 이름은 둘 다 없을 때만.
  const names = {};
  for (const [code, q] of Object.entries(board?.quotes || {})) if (q.name) names[code] = q.name;
  for (const it of alerts?.items || []) names[it.code] = it.name;
  const quotes = {};
  const checked = alertState?.checked_at ? new Date(alertState.checked_at) : null;
  for (const [code, q] of Object.entries(alertState?.quotes || {})) putQuote(quotes, code, { price: q?.price, at: checked, currency: "KRW" });
  const boardAt = board?.asof ? new Date(board.asof) : null;
  for (const [code, q] of Object.entries(board?.quotes || {})) putQuote(quotes, code, { ...q, at: boardAt });
  const m = {
    head, doneIds, shown: first.length, collectOnly: ids.length - finished.length, refCount: finished.length - doneIds.length,
    runs: [], byId: new Map(), accounts: accounts || {}, alerts, alertState,
    // 성적표가 아직 다시 채점되기 전이어도 참고용 판단은 성적에서 뺀다
    scorecard: (scorecard || []).filter(s => !isRef(s.run)), byRun: Object.fromEntries((scorecard || []).map(s => [s.run, s])),
    notes: notes || {}, names, quotes, boardAt, openOrders: openOrders?.orders || [], worth,
  };
  absorb(m, runs); // 최근 것부터 넣어 같은 종목이면 최근 판단의 이름이 남는다(시세는 시각으로 고른다)
  m.fx = board?.fx || m.runs.find(r => r.brief?.fx)?.brief.fx || null;
  return m;
}

// 목록에 보이는 판단: 최근부터 끊김 없이 읽은 만큼
export const shownRuns = () => {
  const m = state.model;
  return m.doneIds.slice(0, m.shown).map(id => m.byId.get(id)).filter(Boolean);
};
export const moreLeft = () => state.model.doneIds.length - state.model.shown;

export async function loadMoreRuns(n = MORE_PAGE) {
  const m = state.model;
  const next = m.doneIds.slice(m.shown, m.shown + n);
  absorb(m, await Promise.all(next.filter(id => !m.byId.has(id)).map(id => loadRun(state.repo, id))));
  m.shown += next.length;
}

// 성적표 등에서 아직 읽지 않은 판단 하나를 열 때(참고용 판단도 주소로는 열린다). 판단까지 가지 않은 실행이면 null.
export async function ensureRun(id) {
  const m = state.model, repo = state.repo;
  if (m.byId.has(id)) return m.byId.get(id);
  if (!repo.has(`runs/${id}/final_decision.json`)) return null;
  absorb(m, [{ ...await loadRun(repo, id), reference: repo.has(`runs/${id}/reference.json`) }]);
  return m.byId.get(id);
}

/* ---------- 계좌 ---------- */
export const accountLabel = k => state.model?.accounts?.[k]?.label || ACCOUNT_FALLBACK[k] || k;
// 칩·좁은 칸에 쓰는 짧은 이름
export const accountShort = k => ACCOUNT_SHORT[k] || accountLabel(k);
export function accountKeys(accounts) {
  return [...ACCOUNT_ORDER.filter(k => accounts[k]?.holdings), ...Object.keys(accounts).filter(k => !ACCOUNT_ORDER.includes(k) && accounts[k]?.holdings)];
}

// 계좌 평가: 모든 보유 종목의 시세(와 달러면 환율)가 있으면 지금 시세로, 하나라도 없으면 최근 분석 시점 값으로.
export function valueAccount(a, quotes, fx, snapshot) {
  const rows = a.holdings.map(h => {
    const q = quotes[h.symbol] || null;
    const k = h.currency === "USD" ? fx : 1;
    return {
      h, q,
      value: q?.price != null && k ? h.qty * q.price * k : null,
      pl: q?.price && h.avg_price ? (q.price / h.avg_price - 1) * 100 : null,
    };
  });
  const live = rows.length > 0 && rows.every(r => r.value != null) && (!a.cash_usd || !!fx);
  const cash = (a.cash_krw || 0) + (a.cash_usd || 0) * (fx || 0);
  const total = live ? rows.reduce((s, r) => s + r.value, 0) + cash : snapshot?.total_krw ?? null;
  for (const r of rows) {
    r.weight = live && total ? r.value / total * 100 : snapshot?.holdings?.find(x => x.symbol === r.h.symbol)?.weight_pct ?? null;
  }
  return { rows, cash, total, live, cashPct: total ? cash / total * 100 : null };
}

export function accountView(key) {
  const m = state.model, a = m.accounts[key];
  const snap = m.runs.find(r => r.accountKey === key && r.brief?.portfolio?.holdings?.length);
  return { key, a, snap, ...valueAccount(a, m.quotes, m.fx, snap?.brief.portfolio) };
}

/* ---------- 평가액 추이 (board-data networth--history.json, 시세판을 열 때마다 다시 계산) ---------- */
// key가 "all"이면 계좌 합계. 계좌가 설정에 생기기 전 날짜는 합계에서 빼고, 그날 시세가 비면 그날을 비운다.
// now({계좌: 지금 평가액})를 주면 마지막 날 뒤에 지금 값을 붙인다. marks는 계좌가 처음 생긴 날(합계가 그만큼 뛴다).
// change는 기간 처음에 있던 계좌만으로 잰 변화(중간에 추가한 계좌는 added에 이름만).
export function worthSeries(worth, key, days, now = null, today = todayKST()) {
  if (!worth?.t?.length) return { points: [], marks: [], change: null };
  const keys = key === "all" ? Object.keys(worth.v) : [key];
  const first = Object.fromEntries(keys.map(k => [k, (worth.v[k] || []).findIndex(v => v != null)]));
  const from = days ? new Date(Date.parse(today) - days * 86400000).toISOString().slice(0, 10) : "";
  const rows = worth.t.map((t, i) => ({ t, by: Object.fromEntries(keys.filter(k => first[k] >= 0 && i >= first[k]).map(k => [k, worth.v[k][i]])) }))
    .filter(r => r.t >= from);
  if (now && rows.length) {
    const by = Object.fromEntries(keys.filter(k => now[k] != null).map(k => [k, now[k]]));
    if (rows.at(-1).t === today) rows.at(-1).by = { ...rows.at(-1).by, ...by };
    else rows.push({ t: "지금", by });
  }
  // 생긴 계좌 중 하나라도 그날 값이 비면 그날 합계도 비운다
  const sum = by => { const v = Object.values(by); return v.length && v.every(x => x != null) ? v.reduce((a, b) => a + b, 0) : null; };
  const points = rows.map(r => ({ t: r.t, v: sum(r.by) }));
  const marks = keys.filter(k => first[k] > 0).map(k => ({ t: worth.t[first[k]], label: `${worth.labels?.[k] || k} 추가` }))
    .filter(m => points.some(p => p.t === m.t));
  const i0 = points.findIndex(p => p.v != null), i1 = points.length - 1 - [...points].reverse().findIndex(p => p.v != null);
  let change = null;
  if (i0 >= 0 && i1 > i0) {
    const base = Object.keys(rows[i0].by);
    const end = base.map(k => rows[i1].by[k]);
    if (end.every(v => v != null)) {
      const v0 = points[i0].v, v1 = end.reduce((a, b) => a + b, 0);
      const added = keys.filter(k => !base.includes(k) && rows[i1].by[k] != null).map(k => worth.labels?.[k] || k);
      change = { d: v1 - v0, r: (v1 / v0 - 1) * 100, since: points[i0].t, added };
    }
  }
  return { points, marks, change };
}

/* ---------- 관심가·일정 (config/price_alerts.json) ---------- */
// 알림 문구에서 짧은 이름만 뽑는다: "2차 관심 $77.43 도달: 주문해 두었다면…" → "2차 관심"
export function levelLabel(msg) {
  const head = String(msg || "").split(":")[0];
  return head.replace(/\s*\(.*$/, "").replace(/\s*\$[\d,.]+|\s[\d,]+원/g, "").replace(/\s*도달$/, "").trim() || head.trim();
}
export const levelNote = msg => { const i = String(msg || "").indexOf(":"); return i < 0 ? "" : msg.slice(i + 1).trim(); };

// 같은 계좌·같은 종목 항목을 하나로 합친다(자동으로 덧붙은 관심가가 같은 종목을 여러 번 만든다). 기한이 지난 항목은 뺀다.
export function mergeLevels(alerts, fired = {}, accountKeyOf = () => "pension", today = todayKST()) {
  const out = new Map();
  for (const it of alerts?.items || []) {
    if (it.until && it.until < today) continue;
    const account = it.account ? accountKeyOf(it.account) : "pension";
    const key = `${account}|${it.code}`;
    let o = out.get(key);
    if (!o) out.set(key, o = { code: it.code, name: it.name, account, currency: it.market === "US" ? "USD" : "KRW", plan: !it.account, hold: null, keep: null, prices: [], dates: [] });
    if (it.hold != null) { o.hold = it.hold; o.keep = it.keep; }
    for (const x of it.alerts || []) {
      const row = { ...x, fired: fired[x.id] || null };
      if (x.price != null) { if (!o.prices.some(p => p.price === x.price && p.op === x.op)) o.prices.push(row); }
      else if (x.date) o.dates.push(row);
    }
  }
  return [...out.values()];
}

// 아직 닿지 않은 가격선을 현재가에서 가까운 순으로. dist는 현재가에서 그 가격까지(%), reached는 이미 조건을 넘은 상태.
export function nearest(items, quotes, n = 5) {
  const rows = [];
  for (const it of items) {
    const q = quotes[it.code];
    if (!q?.price) continue;
    for (const p of it.prices) {
      if (p.fired) continue;
      const dist = (p.price / q.price - 1) * 100;
      rows.push({ item: it, level: p, quote: q, dist, reached: p.op === "<=" ? dist >= 0 : dist <= 0 });
    }
  }
  return rows.sort((a, b) => Math.abs(a.dist) - Math.abs(b.dist)).slice(0, n);
}

// 다가오는 날짜 기준(아직 알리지 않은 것)을 이른 순으로
export function upcoming(items, n = 3) {
  return items.flatMap(it => it.dates.filter(d => !d.fired).map(d => ({ item: it, ...d })))
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, n);
}

export function levelItems() {
  const m = state.model;
  const keyOf = label => Object.keys(m.accounts).find(k => m.accounts[k]?.label === label)
    || ACCOUNT_ORDER.find(k => label.includes(ACCOUNT_FALLBACK[k].replace(" 계좌", ""))) || "main";
  const items = mergeLevels(m.alerts, m.alertState?.fired, keyOf);
  for (const it of items) it.name = m.names[it.code] || it.name;
  return items;
}

/* ---------- 성적 ---------- */
export function scoreSummary(h = "now") {
  const rows = state.model.scorecard.map(s => ({ s, x: s.h?.[h] })).filter(r => r.x);
  const hits = rows.filter(r => typeof r.x.hit === "boolean" && r.s.decision !== "hold");
  const holds = rows.filter(r => typeof r.x.hit === "boolean" && r.s.decision === "hold");
  const dirEx = rows.filter(r => r.s.decision !== "hold" && r.x.excess != null).map(r => (["trim", "sell"].includes(r.s.decision) ? -1 : 1) * r.x.excess);
  const planned = rows.filter(r => ["buy", "split_buy"].includes(r.s.decision) && r.x.plan_ret != null && r.x.lump_ret != null);
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  return {
    n: rows.length,
    hitN: hits.filter(r => r.x.hit).length, hitD: hits.length,
    holdN: holds.filter(r => r.x.hit).length, holdD: holds.length,
    dirEx: avg(dirEx) != null ? avg(dirEx) * 100 : null,
    splitEffect: planned.length ? avg(planned.map(r => r.x.plan_ret - r.x.lump_ret)) * 100 : null,
    plannedN: planned.length,
  };
}

// 판단 하나의 채점 결과를 한 마디로: 적중 / 빗나감 / 무승부, 관망은 안 사길 잘함 / 샀으면 나았음
export function verdict(decision, x) {
  if (!x) return null;
  if (x.hit === null) return { text: "무승부", ok: null };
  if (typeof x.hit !== "boolean") return null;
  if (decision === "hold") return { text: x.hit ? "안 사길 잘함" : "샀으면 나았음", ok: x.hit };
  return { text: x.hit ? "적중" : "빗나감", ok: x.hit };
}
