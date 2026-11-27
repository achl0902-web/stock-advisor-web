// 여러 계좌의 보유·평단·평가액을 합친다. 서로 다른 평가 기준일은 혼합하지 않는다.
export function mergedView(views) {
  const by = new Map();
  for (const v of views) for (const r of v.rows) {
    const previous = by.get(r.h.symbol);
    const cost = r.h.avg_price ? r.h.avg_price * r.h.qty : null;
    if (!previous) {
      by.set(r.h.symbol, { h: { ...r.h }, q: r.q, value: r.value, cost });
      continue;
    }
    previous.h.qty += r.h.qty;
    previous.value = previous.value != null && r.value != null ? previous.value + r.value : null;
    previous.cost = previous.cost != null && cost != null ? previous.cost + cost : null;
  }
  const bases = new Set(views.map(v => v.on ? `history:${v.on}`
    : v.fallbackWorthDate ? `history:${v.fallbackWorthDate}` : v.live ? "live" : "unknown"));
  const mixedBasis = bases.size > 1 || bases.has("unknown");
  const total = !mixedBasis && views.every(v => v.total != null)
    ? views.reduce((sum, v) => sum + v.total, 0) : null;
  const cashMissingFx = views.some(v => v.cashMissingFx);
  const cash = mixedBasis || views.some(v => v.cash == null)
    ? null : views.reduce((sum, v) => sum + v.cash, 0);
  const rows = [...by.values()].map(({ h, q, value, cost }) => {
    h.avg_price = cost != null && h.qty ? cost / h.qty : null;
    return {
      h, q, value,
      pl: q?.price && h.avg_price ? (q.price / h.avg_price - 1) * 100 : null,
      weight: total && value != null ? value / total * 100 : null,
    };
  });
  const sum = field => views.reduce((s, v) => s + (v.a[field] || 0), 0);
  const a = { label: "전체 계좌", holdings: rows.map(r => r.h), cash_krw: sum("cash_krw"), cash_usd: sum("cash_usd") };
  return {
    key: "all", a, rows, cash, cashMissingFx, total, mixedBasis,
    live: views.every(v => v.live), cashPct: cash != null && total ? cash / total * 100 : null,
    snap: null, on: views.find(v => v.on)?.on,
    fallbackWorthDate: views.find(v => v.fallbackWorthDate)?.fallbackWorthDate,
  };
}
