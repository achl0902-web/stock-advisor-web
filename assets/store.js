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
// 자산 탭의 묶음: 바로 쓸 수 있는 돈(계좌)과 묶여 있는 장기 자금(연금·코인). 퇴직연금은 55세 전에 못 빼고,
// 코인은 목표 수량까지 모으는 장기 자산이라 유동 자산 합계에 넣지 않는다.
export const LONG_TERM = ["pension", "crypto"];
export const accountGroup = (accounts, long) => accountKeys(accounts).filter(k => LONG_TERM.includes(k) === long);

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

/* ---------- 평가액 추이 (board-data networth--history.json, 시세판을 열 때마다 다시 계산) ----------
   worth.v[계좌][i] = 그날 평가액, worth.f[계좌][i] = 그날 순입출금(입금 +, 출금·증여 −).
   투자손익 = 기말 − 기초 − 그 사이 순입출금, 투자원금 = 기초 + 순입출금, 투자수익률 = 투자손익 ÷ 투자원금(증권사 투자성과와 같은 식). */

// key: 계좌 하나, 계좌 목록(합계), "all". win: {from, to} 날짜(없으면 처음·끝). now({계좌: 지금 평가액})를 주면 끝이 오늘일 때 지금 값을 붙인다.
// 계좌가 기간 중에 처음 생기면 그날 평가액을 입금으로 본다(합계에 계좌가 더해져도 손익이 되지 않게).
// 달러 기준 추이: 그날 환율로 평가액·입출금을 달러로 바꾼다. 실현손익·배당은 달러 원가로 다시 잰 값(networth의 *_usd).
// 환율이 없는 날은 앞 날 환율. 기록에 환율이 없으면(예전 자료) null
const usdMemo = new WeakMap();
export function inUsd(worth) {
  if (!worth?.fx?.some(x => x)) return null;
  if (usdMemo.has(worth)) return usdMemo.get(worth);
  let last = worth.fx.find(x => x);
  const fx = worth.fx.map(x => (last = x || last));
  const conv = o => Object.fromEntries(Object.entries(o || {}).map(([k, a]) => [k, a.map((x, i) => x == null ? null : x / fx[i])]));
  const out = { ...worth, v: conv(worth.v), f: conv(worth.f), realized: worth.realized_usd, income: worth.income_usd };
  usdMemo.set(worth, out);
  return out;
}

export function worthSeries(worth, key, win = {}, now = null, today = todayKST()) {
  const empty = { points: [], marks: [], sum: null };
  if (!worth?.t?.length) return empty;
  const keys = Array.isArray(key) ? key.filter(k => worth.v[k]) : key === "all" ? Object.keys(worth.v) : [key];
  const first = Object.fromEntries(keys.map(k => [k, (worth.v[k] || []).findIndex(v => v != null)]));
  const end = win.to || worth.t.at(-1);
  let rows = worth.t.map((t, i) => {
    const by = {}, fl = {};
    for (const k of keys) {
      if (first[k] < 0 || i < first[k]) continue; // 아직 설정에 없던 계좌
      by[k] = worth.v[k][i];
      // 처음 생긴 날은 그날 평가액 전부가 들어온 돈(그날 거래내역 입출금은 그 안에 있다)
      fl[k] = i === first[k] ? (worth.v[k][i] ?? 0) : (worth.f?.[k]?.[i] || 0);
    }
    return { t, by, fl };
  });
  // 기초는 시작일 전날 마감 값(증권사 투자성과와 같이 시작일 하루치 손익도 기간에 넣는다)
  const startAt = win.from ? Math.max(0, worth.t.findIndex(t => t >= win.from) - 1) : 0;
  rows = rows.filter((r, i) => i >= startAt && r.t <= end);
  const lead = rows.findIndex(r => Object.keys(r.by).length);
  if (lead < 0) return empty;
  rows = rows.slice(lead);
  if (now && end >= worth.t.at(-1)) {
    const by = Object.fromEntries(keys.filter(k => now[k] != null && first[k] >= 0).map(k => [k, now[k]]));
    if (rows.at(-1).t === today) rows.at(-1).by = { ...rows.at(-1).by, ...by };
    else rows.push({ t: "지금", by: { ...rows.at(-1).by, ...by }, fl: {} });
  }
  // 생긴 계좌 중 하나라도 그날 값이 비면 그날 합계도 비운다
  const total = by => { const v = Object.values(by); return v.length && v.every(x => x != null) ? v.reduce((a, b) => a + b, 0) : null; };
  const i0 = rows.findIndex(r => total(r.by) != null);
  if (i0 < 0) return empty;
  const base = total(rows[i0].by);
  let cum = 0;
  const points = rows.map((r, i) => {
    if (i > i0) cum += Object.values(r.fl).reduce((a, b) => a + b, 0);
    return { t: r.t, v: total(r.by), p: i < i0 ? null : base + cum }; // p = 그날까지 투자원금
  });
  const i1 = points.length - 1 - [...points].reverse().findIndex(p => p.v != null);
  const flows = points[i1].p - base, endV = points[i1].v;
  const pnl = endV - base - flows, principal = base + flows;
  const sum = { from: points[i0].t, to: points[i1].t, base, end: endV, flows, principal, pnl, rate: principal > 0 ? pnl / principal * 100 : null };
  // 실현손익·배당·이자: 기초 다음 날부터 기말까지(거래내역이 있는 계좌만). 나머지는 아직 팔지 않은 평가손익의 변화
  const upto = sum.to === "지금" ? today : sum.to;
  const inWin = d => d > sum.from && d <= upto;
  const known = keys.filter(k => worth.realized?.[k]);
  if (known.length) {
    const sells = known.flatMap(k => worth.realized[k].filter(([d]) => inWin(d)).map(([d, sym, v]) => ({ d, sym, v, k })));
    const income = known.flatMap(k => worth.income?.[k] || []).filter(([d]) => inWin(d));
    sum.realized = sells.reduce((a, x) => a + x.v, 0);
    sum.income = income.reduce((a, [, , v]) => a + v, 0);
    sum.unrealized = pnl - sum.realized - sum.income;
    sum.sells = sells.sort((a, b) => b.d.localeCompare(a.d));
    sum.partial = known.length < keys.length; // 거래내역이 없는 계좌가 섞임
  }
  const marks = (worth.events ? keys.flatMap(k => (worth.events[k] || []).map(e => ({ t: e.d, label: e.label }))) : [])
    .filter(m => points.some(p => p.t === m.t));
  return { points, marks, sum };
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
