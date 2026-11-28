const timezoneFormatters = new Map();
function Co(t, e) {
  if (e === "UTC") return 0;
  let n = timezoneFormatters.get(e);
  if (!n) {
    n = new Intl.DateTimeFormat("en-US", {
      timeZone: e,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    timezoneFormatters.set(e, n);
  }
  const i = {};
  for (const { type, value } of n.formatToParts(t)) i[type] = Number(value);
  const a = Date.UTC(
    i.year,
    i.month - 1,
    i.day,
    i.hour % 24,
    i.minute,
    i.second,
  );
  return Math.round((a - Math.floor(t / 1000) * 1000) / 60000) * 60000;
}

export function buildRegistry(t) {
  let e = new Map();
  const familyMode = typeof window !== "undefined" && window.saFamily;
  for (let n of [...t.heat_us, ...t.heat_kr]) {
    if (!n.doc) continue;
    e.set(n.sym, {
      sym: n.sym,
      name: n.name,
      kind: "heat",
      country: /\.K[SQ]$/.test(n.sym) ? "KR" : "US",
      last: n.last,
      prev: n.last / (1 + n.chg / 100),
      chg: n.chg,
      col: "heatbars",
      doc: n.doc,
      heat: n,
    });
  }
  for (let n of t.macro) {
    let i =
      n.sym === "^KS11" || n.sym === "^KQ11"
        ? "KR"
        : n.sym === "^N225"
          ? "JP"
          : /^BTC-/.test(n.sym)
            ? "CRYPTO"
            : /^\^|=F$/.test(n.sym)
              ? "US"
              : "GL";
    e.set(n.sym, {
      sym: n.sym,
      name: n.name,
      kind: "macro",
      country: i,
      last: n.last,
      prev: n.prev,
      chg: n.chg_pct,
      changeUnavailable: !!n.change_unavailable,
      spark: n.spark,
      col: "bars",
      doc: n.doc,
      macro: n,
    });
  }
  for (let n of t.watch) {
    if (
      familyMode &&
      n.accounts?.length &&
      n.accounts.every((a) => ["bio", "pension"].includes(a.account))
    )
      continue;
    e.set(n.yf, {
      sym: n.yf,
      name: watchName(n),
      kind: "watch",
      country: n.market,
      last: n.last,
      prev: n.prev,
      chg: n.chg_pct,
      changeUnavailable: !!n.change_unavailable,
      spark: n.spark,
      col: "bars",
      doc: n.doc,
      extended:
        n.extended && Math.abs(Date.now() - Date.parse(n.extended.asof)) < 12e5
          ? n.extended
          : null,
      watch: n,
    });
  }
  return e;
}
var vw = {
  QLD: "QLD",
  STRC: "STRC",
  QQQ: "QQQ",
  ASHR: "ASHR",
  HWM: "하우멧 에어로스페이스",
  LEU: "센트러스 에너지",
};
function watchName(t) {
  return vw[t.code] ?? t.name;
}
var isKoreanETF = (t) =>
  /^(KODEX|TIGER|ACE|RISE|SOL|KBSTAR|HANARO|PLUS)\b/.test(t);
function exchangeTimezone(t) {
  if (t.country === "KR" || t.country === "CRYPTO") return "Asia/Seoul";
  if (t.country === "JP") return "Asia/Tokyo";
  return "America/New_York";
}
function exchangeSession(t) {
  if (t.country === "KR") return "0900-1530";
  if (t.country === "JP") return "0900-1530";
  if (/=F$|=X$|^DX-/.test(t.sym) || t.country === "CRYPTO") return "24x7";
  return "0930-1600";
}
export function pricePrecision(t) {
  if (t.country === "KR" && t.kind !== "macro") return 0;
  if (t.sym === "^TNX") return 3;
  if (t.sym === "BTC-KRW") return 0;
  return 2;
}
// KRX 유가증권시장 일반 주식의 가격 구간별 호가 단위.
// 기존 번들에 포함된 차트 엔진 함수를 보존한다.
function krTickSize(price) {
  if (price < 2000) return 1;
  if (price < 5000) return 5;
  if (price < 20000) return 10;
  if (price < 50000) return 50;
  if (price < 200000) return 100;
  if (price < 500000) return 500;
  return 1000;
}
function localMidnightMs(t, e) {
  let [n, i, a] = t.split("-").map(Number),
    o = Date.UTC(n, i - 1, a),
    r = o - Co(o, e);
  return ((r = o - Co(r, e)), r);
}
function toCandles(t, e, n) {
  let i = [];
  for (let a = 0; a < t.c.length; a++) {
    let o = n ? t.t[a] : localMidnightMs(t.t[a], e);
    i.push({
      time: o,
      open: t.o[a],
      high: t.h[a],
      low: t.l[a],
      close: t.c[a],
      volume: t.v?.[a] ?? 0,
    });
  }
  return i;
}
function aggregateCandles(t, e, n) {
  let i = [],
    a = null,
    o = "";
  return (
    t.forEach((r, l) => {
      let s = n(e[l]);
      if (!a || s !== o) ((a = { ...r }), (o = s), i.push(a));
      else
        ((a.high = Math.max(a.high, r.high)),
          (a.low = Math.min(a.low, r.low)),
          (a.close = r.close),
          (a.volume = (a.volume ?? 0) + (r.volume ?? 0)));
    }),
    i
  );
}
var weekStart = (t) => {
  let [e, n, i] = t.split("-").map(Number),
    a = Date.UTC(e, n - 1, i),
    o = (new Date(a).getUTCDay() + 6) % 7;
  return new Date(a - o * 86400000).toISOString().slice(0, 10);
};
export class BoardDatafeed {
  loader;
  registry = new Map();
  docs = new Map();
  candles = new Map();
  subs = new Set();
  quoteSubs = new Set();
  constructor(t) {
    this.loader = t;
  }
  update(t) {
    ((this.registry = buildRegistry(t)), this.docs.clear(), this.candles.clear());
    for (let e of this.subs) {
      let n = this.registry.get(e.e.sym);
      if (!n) continue;
      this.bars(n, e.res).then((i) => {
        let a = i[i.length - 1];
        if (a) e.onBar(a);
      });
    }
    for (let e of this.quoteSubs) {
      let n = this.registry.get(e.e.sym);
      if (n)
        e.cb({ price: n.last, change: n.last - n.prev, changePercent: n.chg });
    }
  }
  load(symbol, recent = false) {
    const collection = recent && symbol.col === "bars" ? "barsrecent" : symbol.col;
    const cacheKey = `${collection}/${symbol.doc}`;
    if (!this.docs.has(cacheKey)) {
      this.docs.set(cacheKey, this.loader(collection, symbol.doc).catch(() => null));
    }
    return this.docs.get(cacheKey);
  }
  async bars(symbol, resolution, full = false) {
    // 좌우 이동·확대할 때 동일 종목·주기를 반복 요청하므로 변환한 봉까지 캐시한다.
    const key = `${symbol.col}/${symbol.doc}/${symbol.sym}/${resolution}/${full ? "full" : "recent"}`;
    if (!this.candles.has(key)) {
      const pending = this.readBars(symbol, resolution, full).catch(error => {
        if (this.candles.get(key) === pending) this.candles.delete(key);
        throw error;
      });
      this.candles.set(key, pending);
    }
    return this.candles.get(key);
  }
  async readBars(symbol, resolution, full = false) {
    const timezone = exchangeTimezone(symbol);
    if (resolution === "60" && symbol.col === "bars") {
      // 별도 시간봉을 우선 조회하면 10년치 일봉 파일을 다운로드하지 않아도 된다.
      const cacheKey = `hourly/${symbol.doc}`;
      if (!this.docs.has(cacheKey)) {
        this.docs.set(cacheKey, this.loader("hourly", symbol.doc).catch(() => null));
      }
      const hourlyDoc = await this.docs.get(cacheKey);
      if (hourlyDoc?.sym === symbol.sym && hourlyDoc.h?.t?.length) {
        return toCandles(hourlyDoc.h, timezone, true);
      }
    }
    // 이전 배포본은 bars.h만 갖고 있으므로 읽기 호환성을 유지한다.
    const doc = await this.load(symbol, !full && resolution !== "60");
    const resolved = doc || await this.load(symbol); // 아직 barsrecent 파일이 없는 배포와 호환
    if (!resolved) return [];
    if (resolution === "60") return resolved.h ? toCandles(resolved.h, timezone, true) : [];

    const daily = symbol.col === "heatbars" ? resolved.items?.[symbol.sym] : resolved.d;
    if (!daily) return [];
    const candles = toCandles(daily, timezone, false);
    if (resolution === "1W") return aggregateCandles(candles, daily.t, weekStart);
    if (resolution === "1M") return aggregateCandles(candles, daily.t, date => date.slice(0, 7));
    return candles;
  }
  info(t) {
    let e = t.watch ? isKoreanETF(t.watch.name) : !1;
    return {
      symbol: t.sym,
      name: t.name,
      exchange:
        t.kind === "macro"
          ? "지수·매크로"
          : t.country === "KR"
            ? t.sym.endsWith(".KQ")
              ? "KOSDAQ"
              : "KOSPI"
            : "US",
      timezone: exchangeTimezone(t),
      session: exchangeSession(t),
      pricePrecision: pricePrecision(t),
      tickSize:
        t.country === "KR" && t.kind !== "macro"
          ? e
            ? 5
            : krTickSize
          : t.country === "CRYPTO"
            ? 1000
            : Math.pow(10, -pricePrecision(t)),
      type:
        t.country === "CRYPTO"
          ? "crypto"
          : t.kind === "macro"
            ? /=F$/.test(t.sym)
              ? "futures"
              : /=X$|^DX-/.test(t.sym)
                ? "forex"
                : "index"
            : e
              ? "etf"
              : "stock",
      country: t.country === "KR" ? "KR" : "US",
      supportedResolutions:
        t.col === "bars" ? ["60", "1D", "1W", "1M"] : ["1D", "1W", "1M"],
    };
  }
  async resolveSymbol(t) {
    let e = this.registry.get(t);
    if (!e) throw Error(`${t}: 보드에 없는 종목`);
    return this.info(e);
  }
  async getBars(symbolInfo, resolution, request) {
    const symbol = this.registry.get(symbolInfo.symbol);
    if (!symbol) return { bars: [], noMoreData: true };
    let candles = await this.bars(symbol, resolution);
    let available = candles.filter(candle => candle.time <= request.to);
    const requested = Math.max(1, request.countBack || 300);
    // 처음 화면은 가벼운 최근 봉만, 더 과거로 이동하면 기존 전체 일봉을 지연 로드한다.
    if (symbol.col === "bars" && resolution !== "60" && candles.length &&
        (request.to < candles[0].time || available.length < requested)) {
      candles = await this.bars(symbol, resolution, true);
      available = candles.filter(candle => candle.time <= request.to);
    }
    const bars = available.slice(-requested);
    return { bars, noMoreData: bars.length === available.length };
  }
  subscribeBars(t, e, n, i, a) {
    let o = this.registry.get(t.symbol);
    if (!o) return () => {};
    let r = { e: o, res: e, onBar: n };
    return (
      this.subs.add(r),
      a?.({ status: "connected" }),
      () => this.subs.delete(r)
    );
  }
  subscribeQuotes(t, e) {
    let n = this.registry.get(t.symbol);
    if (!n) return () => {};
    let i = { e: n, cb: e };
    return (
      this.quoteSubs.add(i),
      e({ price: n.last, change: n.last - n.prev, changePercent: n.chg }),
      () => this.quoteSubs.delete(i)
    );
  }
  async searchSymbols(t) {
    let e = t.trim().toLowerCase(),
      n = { watch: 0, macro: 1, heat: 2 };
    return [...this.registry.values()]
      .filter(
        (i) =>
          !e ||
          i.name.toLowerCase().includes(e) ||
          i.sym.toLowerCase().includes(e),
      )
      .sort((i, a) => n[i.kind] - n[a.kind])
      .slice(0, 60)
      .map((i) => ({
        ...this.info(i),
        price: i.last,
        changePercent: i.chg,
        sparkline: i.spark?.slice(-30),
      }));
  }
  async getSparkline(t) {
    return this.registry.get(t)?.spark?.slice(-30) ?? [];
  }
  trading() {
    return {
      getPositions: async (t) =>
        (this.registry.get(t.symbol)?.watch?.accounts ?? [])
          .filter(
            (n) =>
              n.avg &&
              n.qty &&
              !(window.saFamily && ["bio", "pension"].includes(n.account)),
          )
          .map((n) => ({
            price: n.avg,
            quantity: n.qty,
            side: "long",
            label: `평단 · ${n.label.replace(" 계좌", "")}`,
          })),
      getOrders: async (t) =>
        (this.registry.get(t.symbol)?.watch?.orders ?? []).map((n) => ({
          id: n.id,
          price: n.price,
          quantity: n.qty,
          side: n.side,
          label: "지정가",
        })),
      getExecutions: async (t) => {
        let e = this.registry.get(t.symbol);
        if (!e) return [];
        let n = exchangeTimezone(e);
        return (e.watch?.fills ?? [])
          .filter(
            (i) => !(window.saFamily && ["bio", "pension"].includes(i[4])),
          )
          .map((i, a) => ({
            id: `fill${a}`,
            time: localMidnightMs(i[0], n),
            side: i[1],
            price: i[2],
            quantity: i[3],
          }));
      },
    };
  }
}
