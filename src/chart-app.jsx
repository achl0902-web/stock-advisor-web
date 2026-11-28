/**
 * 시세판 React 앱의 복구 소스. 최초 작성자의 JSX는 Git 이력에 없었습니다.
 * 2026-11-27 배포본에서 앱 로직만 분리하고 라이브러리는 npm 패키지로 교체했습니다.
 * 이 파일을 변경한 후 npm run build:chart로 배포 번들을 재생성합니다.
 */
import * as React from "react";
import { createRoot } from "react-dom/client";
import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { createTradingChart } from "@funnest/charts-ui";
import { LineChart, TreemapChart } from "@funnest/charts-react";

// 시세 공급자와 GitHub 저장소 통신은 화면 컴포넌트와 분리한다.
import { BoardDatafeed, buildRegistry, pricePrecision } from "./board-datafeed.js";
import { GithubBoard, readGithubConfig } from "./github-board.js";

var UP_COLOR = "var(--up)",
  DOWN_COLOR = "var(--down)",
  formatNumber = (t, e) =>
    t.toLocaleString("ko-KR", {
      minimumFractionDigits: e,
      maximumFractionDigits: e,
    }),
  formatQuotePrice = (t, e) =>
    formatNumber(e, t.country === "KR" && t.kind !== "macro" ? 0 : pricePrecision(t)),
  $n = (t) => `${t > 0 ? "+" : ""}${t.toFixed(2)}%`,
  changeClass = (t) => (t > 0 ? "is-up" : t < 0 ? "is-down" : "is-flat"),
  quoteUnit = (t) =>
    (t.country === "KR" && t.kind !== "macro") || t.country === "CRYPTO"
      ? "원"
      : t.country === "US" && t.kind !== "macro"
        ? "$"
        : "";
function formatUpdateTime(t) {
  let e = new Date(t),
    n = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: !1,
    }).formatToParts(e),
    i = (a) => n.find((o) => o.type === a)?.value ?? "";
  return `${i("month")}/${i("day")} ${i("hour")}:${i("minute")}`;
}
function formatMarketCap(t, e) {
  return e ? `${formatNumber(t / 1000000000000, 0)}조원` : `$${formatNumber(t / 1e9, 0)}B`;
}
var isDarkMode = () => !0;
function chartTheme() {
  let t = getComputedStyle(document.documentElement),
    e = (n) => t.getPropertyValue(n).trim();
  return {
    background: e("--panel"),
    surface: e("--raised"),
    text: e("--ink"),
    textSecondary: e("--sub"),
    grid: e("--grid"),
    border: e("--line"),
    crosshair: e("--sub"),
    up: e("--up"),
    down: e("--down"),
    accent: e("--accent"),
    fontFamily: e("--font-ui"),
  };
}
function usePaletteSync(t) {
  React.useEffect(() => {
    let e = window.matchMedia("(prefers-color-scheme: dark)"),
      n = new MutationObserver(t);
    return (
      n.observe(document.documentElement, {
        attributes: !0,
        attributeFilter: ["data-palette"],
      }),
      e.addEventListener?.("change", t),
      () => {
        (n.disconnect(), e.removeEventListener?.("change", t));
      }
    );
  }, [t]);
}
var MAX_SNAPSHOT_AGE_MS = 180000,
  snapshotAgeMs = (t) => (t ? Date.now() - new Date(t.asof).getTime() : 1 / 0);
function useBoardData() {
  let [t, e] = React.useState(null),
    [n, i] = React.useState("loading"),
    [a, o] = React.useState(""),
    [r, l] = React.useState(""),
    [s, c] = React.useState(null),
    d = React.useRef(null),
    h = React.useRef(null),
    u = React.useRef(null),
    p = React.useRef(!1),
    y = async (S) => {
      let g = await S.json("market", "snapshot");
      if (!g) {
        i("empty");
        return;
      }
      if (!h.current) h.current = new BoardDatafeed((m, b) => S.json(m, b));
      (h.current.update(g), (u.current = g), c(h.current), e(g), i("ready"));
    },
    x = async (S) => {
      let g = d.current;
      if (!g || p.current) return;
      ((p.current = !0), o(""));
      try {
        if ((l("불러오는 중"), (await g.refresh()) || !u.current)) await y(g);
        if (S || snapshotAgeMs(u.current) > MAX_SNAPSHOT_AGE_MS) {
          if (
            (l("새 시세 수집 중"),
            await g.collect((m) => l(`새 시세 수집 중 · ${m}초`)))
          )
            await y(g);
        }
      } catch (m) {
        if ((o(m.message), !u.current)) i("offline");
      } finally {
        ((p.current = !1), l(""));
      }
    };
  return (
    React.useEffect(() => {
      let S = readGithubConfig();
      if (!S) {
        i("setup");
        return;
      }
      ((d.current = new GithubBoard(S)), x(!1));
      let g = () =>
        document.visibilityState === "visible" &&
        snapshotAgeMs(u.current) > 600000 &&
        x(!1);
      return (
        document.addEventListener("visibilitychange", g),
        () => document.removeEventListener("visibilitychange", g)
      );
    }, []),
    { snap: t, status: n, feed: s, error: a, busy: r, pull: () => x(!0) }
  );
}
// 캔버스 차트를 앱 상태와 연결한다. 종목 변경 시 체결/가격선을 동기화한다.
function ChartStage({ feed: t, symbol: e, onSymbol: n, compact: i }) {
  let a = React.useRef(null),
    o = React.useRef(null),
    r = React.useRef([]),
    l = React.useRef(n);
  l.current = n;
  let s = (c) => {
    (r.current.forEach((h) => h.remove()), (r.current = []));
    let d = t.registry.get(c)?.watch;
    if (!d || !o.current) return;
    for (let h of d.lines)
      r.current.push(
        o.current.chart.addAlertLine({ price: h.price, label: h.label }),
      );
  };
  // 모바일에서는 차트 위의 작은 내비게이션 대신 손가락 크기의 별도 버튼을 제공한다.
  // scrollBars는 엔진의 과거 페이지 로딩 경로를 그대로 사용한다.
  const navigate = (direction) => {
    const chart = o.current?.chart;
    if (!chart) return;
    if (direction === "latest") { chart.scrollToRealtime(); return; }
    if (direction === "zoom-in") { chart.zoom(1.5); return; }
    if (direction === "zoom-out") { chart.zoom(1 / 1.5); return; }
    const range = chart.timeScale.visibleRange();
    const page = range.to >= range.from ? Math.max(8, Math.round((range.to - range.from + 1) * 0.6)) : 30;
    chart.scrollBars(direction === "past" ? -page : page);
  };
  return (
    React.useEffect(() => {
      if (!a.current) return;
      let c = createTradingChart(a.current, {
        datafeed: t,
        symbol: e,
        resolution: "1D",
        locale: "ko",
        colorScheme: isDarkMode() ? "dark" : "light",
        theme: chartTheme(),
        trading: t.trading(),
        favoriteIntervals: ["60", "1D", "1W", "1M"],
        drawingToolbar: !i,
        legendValues: i ? "crosshair" : "always",
        settings: { navigationButtons: !i },
        storageKey: "board-terminal",
        attribution: !0,
      });
      o.current = c;
      let d = !0,
        h = c.chart.on("symbolChange", (u) => {
          if (d) {
            d = !1;
            try {
              if (!c.chart.indicatorLegend?.().length)
                c.chart.addIndicator("ma");
            } catch {}
          }
          (s(u.symbol), l.current(u.symbol));
        });
      return () => {
        (h(), c.destroy(), (o.current = null));
      };
    }, [t, i]),
    React.useEffect(() => {
      let c = o.current;
      if (c && c.chart.symbol?.symbol !== e) c.setSymbol(e).catch(() => {});
    }, [e]),
    usePaletteSync(
      React.useMemo(
        () => () => {
          let c = o.current;
          if (!c) return;
          (c.setColorScheme(isDarkMode() ? "dark" : "light"), c.setTheme(chartTheme()));
        },
        [],
      ),
    ),
    jsxs(Fragment, {
      children: [
        jsx("div", { className: "chart-host", ref: a }),
        i && jsxs("div", {
          className: "chart-mobile-nav",
          role: "group",
          "aria-label": "차트 가로축 이동과 확대",
          children: [
            jsx("button", { type: "button", onClick: () => navigate("past"), "aria-label": "차트를 과거로 이동", children: "과거" }),
            jsx("button", { type: "button", onClick: () => navigate("future"), "aria-label": "차트를 최근 쪽으로 이동", children: "다음" }),
            jsx("button", { type: "button", onClick: () => navigate("zoom-out"), "aria-label": "차트 가로축 축소", children: "축소" }),
            jsx("button", { type: "button", onClick: () => navigate("zoom-in"), "aria-label": "차트 가로축 확대", children: "확대" }),
            jsx("button", { type: "button", onClick: () => navigate("latest"), "aria-label": "최신 시세 위치로 이동", children: "최근" }),
          ],
        }),
      ],
    })
  );
}
function QuickSymbols({ reg, active, pick }) {
  const items = [...reg.values()].filter(item => item.kind === "watch");
  if (!items.length) return null;
  return jsxs("nav", {
    className: "quick-symbols",
    "aria-label": "관심종목 빠른 선택",
    children: [
      jsx("span", { className: "quick-title", children: "종목 바로 보기" }),
      jsx("div", {
        className: "quick-track",
        children: items.map(item => jsx("button", {
          type: "button",
          className: `quick-pick ${active === item.sym ? "is-active" : ""}`,
          "aria-pressed": active === item.sym,
          onClick: () => pick(item.sym),
          title: `${item.name} (${item.sym})`,
          children: item.name,
        }, item.sym)),
      }),
    ],
  });
}
function MacroTicker({ snap: t, reg: e, active: n, pick: i }) {
  return jsx("nav", {
    className: "tape",
    "aria-label": "지수와 매크로",
    children: jsx("div", {
      className: "tape-track",
      children: t.macro.map((a) => {
        let o = e.get(a.sym);
        return jsxs(
          "button",
          {
            className: `tick ${n === a.sym ? "is-active" : ""}`,
            onClick: () => i(a.sym),
            type: "button",
            children: [
              jsx("span", { className: "tick-name", children: a.name }),
              jsxs("span", {
                className: "tick-row",
                children: [
                  jsxs("span", {
                    className: "tick-last",
                    children: [formatQuotePrice(o, a.last), a.unit ?? ""],
                  }),
                  jsx("span", {
                    className: `tick-chg ${changeClass(a.chg_pct)}`,
                    children: $n(a.chg_pct),
                  }),
                ],
              }),
              jsx("span", {
                className: "tick-spark",
                "aria-hidden": "true",
                children: jsx(LineChart, {
                  series: [{ id: "s", data: a.spark.slice(-30) }],
                  height: 22,
                  inset: 2,
                  strokeWidth: 1.25,
                  animate: !1,
                  baseline: a.spark[a.spark.length - 31] ?? a.spark[0],
                  splitColors: { above: UP_COLOR, below: DOWN_COLOR },
                }),
              }),
            ],
          },
          a.sym,
        );
      }),
    }),
  });
}
var WATCH_GROUPS = [
  {
    id: "main",
    label: "주 계좌",
    test: (t) => !!t.watch?.accounts.some((e) => e.account === "main"),
  },
  {
    id: "crypto",
    label: "코인",
    test: (t) => !!t.watch?.accounts.some((e) => e.account === "crypto"),
  },
  ...(window.saFamily
    ? []
    : [
        {
          id: "bio",
          label: "바이오 계좌",
          test: (t) => !!t.watch?.accounts.some((e) => e.account === "bio"),
        },
        {
          id: "pension",
          label: "퇴직연금",
          test: (t) => !!t.watch?.accounts.some((e) => e.account === "pension"),
        },
      ]),
  {
    id: "watch",
    label: "관심가 대기",
    test: (t) => !!t.watch && t.watch.accounts.length === 0,
  },
];
function Watchlist({ reg: t, active: e, pick: n }) {
  let i = [...t.values()].filter((a) => a.kind === "watch");
  return jsx("div", {
    className: "watch",
    role: "list",
    children: WATCH_GROUPS.map((a) => {
      let o = i.filter(a.test);
      if (!o.length) return null;
      return jsxs(
        "section",
        {
          className: "w-group",
          "aria-label": a.label,
          children: [
            jsxs("h3", {
              className: "w-head",
              children: [a.label, jsx("span", { children: o.length })],
            }),
            o.map((r) => {
              let l = r.watch.accounts[0],
                s = l?.avg ? (r.last / l.avg - 1) * 100 : null;
              return jsxs(
                "button",
                {
                  role: "listitem",
                  type: "button",
                  className: `w-row ${e === r.sym ? "is-active" : ""}`,
                  onClick: () => n(r.sym),
                  children: [
                    jsxs("span", {
                      className: "w-name",
                      children: [
                        jsx("b", { children: r.name }),
                        jsxs("small", {
                          children: [
                            r.watch.code,
                            s !== null &&
                              jsxs(Fragment, {
                                children: [
                                  " · 평단 대비 ",
                                  jsx("i", {
                                    className: changeClass(s),
                                    children: $n(s),
                                  }),
                                ],
                              }),
                          ],
                        }),
                      ],
                    }),
                    jsx("span", {
                      className: "w-spark",
                      "aria-hidden": "true",
                      children:
                        r.spark &&
                        jsx(LineChart, {
                          series: [{ id: "s", data: r.spark.slice(-40) }],
                          height: 26,
                          inset: 2,
                          strokeWidth: 1.25,
                          animate: !1,
                          baseline: r.spark[Math.max(0, r.spark.length - 41)],
                          splitColors: { above: UP_COLOR, below: DOWN_COLOR },
                        }),
                    }),
                    jsxs("span", {
                      className: "w-quote",
                      children: [
                        jsx("b", { children: formatQuotePrice(r, r.last) }),
                        jsx("i", {
                          className: `chip ${changeClass(r.chg)}`,
                          children: $n(r.chg),
                        }),
                        r.extended &&
                          jsx("small", {
                            className: "extended-note",
                            title: `${r.extended.close_date} 종가 대비 · ${r.extended.asof}`,
                            children: `${r.extended.session === "pre" ? "장전" : "장후"} ${formatQuotePrice(r, r.extended.last)} (${$n(r.extended.vs_close_pct)})`,
                          }),
                      ],
                    }),
                  ],
                },
                r.sym,
              );
            }),
          ],
        },
        a.id,
      );
    }),
  });
}
function PriceLadder({ e: t, feed: e, crypto: n }) {
  let [i, a] = React.useState(null);
  React.useEffect(() => {
    let x = !0;
    return (
      e.bars(t, "1D").then((S) => {
        if (!x || !S.length) return;
        let g = S.slice(-252);
        a({
          hi: Math.max(...g.map((m) => m.high)),
          lo: Math.min(...g.map((m) => m.low)),
        });
      }),
      () => {
        x = !1;
      }
    );
  }, [t.sym, e]);
  let o = [{ price: t.last, label: "지금", kind: "now" }];
  for (let x of t.watch?.accounts ?? [])
    if (x.avg) o.push({ price: x.avg, label: "내 평단", kind: "avg" });
  for (let x of t.watch?.lines ?? [])
    o.push({ price: x.price, label: x.label, kind: "line" });
  if (i)
    (o.push({ price: i.hi, label: "52주 최고", kind: "hi" }),
      o.push({ price: i.lo, label: "52주 최저", kind: "lo" }));
  let r = Math.min(...o.map((x) => x.price)),
    l = Math.max(...o.map((x) => x.price)),
    s = Math.max(200, Math.min(300, o.length * 26)),
    c = (x) => (l === r ? s / 2 : ((l - x) / (l - r)) * s),
    d = o.map((x) => ({ ...x, y: c(x.price) })).sort((x, S) => x.y - S.y);
  for (let x = 1; x < d.length; x++)
    if (d[x].y - d[x - 1].y < 22) d[x].y = d[x - 1].y + 22;
  let h = d.length ? d[d.length - 1].y - s : 0;
  if (h > 0) d.forEach((x) => (x.y -= h * (x.y / (s + h))));
  let u = s + 24,
    p = t.watch?.accounts[0],
    y = p?.avg ? (t.last / p.avg - 1) * 100 : null;
  return jsxs("div", {
    className: "ladder",
    children: [
      jsxs("div", {
        className: "ladder-top",
        children: [
          jsxs("div", {
            children: [
              jsx("h3", { className: "panel-h", children: t.name }),
              jsxs("p", {
                className: "sub",
                children: [
                  t.watch?.code ?? t.sym,
                  " · ",
                  t.kind === "macro"
                    ? t.macro.group
                    : t.kind === "heat"
                      ? t.heat.sector
                      : "내 종목",
                ],
              }),
            ],
          }),
          jsxs("div", {
            className: "ladder-price",
            children: [
              jsxs("b", {
                children: [
                  quoteUnit(t) === "$" ? "$" : "",
                  formatQuotePrice(t, t.last),
                  quoteUnit(t) === "원" ? "원" : "",
                ],
              }),
              jsx("span", { className: changeClass(t.chg), children: $n(t.chg) }),
              t.extended &&
                jsx("small", {
                  className: "extended-note",
                  title: `${t.extended.close_date} 종가 대비 · ${t.extended.asof}`,
                  children: `${t.extended.session === "pre" ? "장전" : "장후"} ${quoteUnit(t) === "$" ? "$" : ""}${formatQuotePrice(t, t.extended.last)} (${$n(t.extended.vs_close_pct)})`,
                }),
            ],
          }),
        ],
      }),
      t.country === "CRYPTO" &&
        n &&
        jsxs("div", {
          className: "goal",
          children: [
            jsxs("div", {
              className: "goal-top",
              children: [
                jsxs("span", { children: ["목표 ", n.goal, " ", n.symbol] }),
                jsxs("b", {
                  children: [
                    n.qty.toFixed(4),
                    " ",
                    jsxs("small", { children: ["/ ", n.goal] }),
                  ],
                }),
              ],
            }),
            jsx("div", {
              className: "goal-bar",
              role: "img",
              "aria-label": `목표의 ${((n.qty / n.goal) * 100).toFixed(1)}%`,
              children: jsx("i", {
                style: { width: `${Math.min(100, (n.qty / n.goal) * 100)}%` },
              }),
            }),
            jsxs("p", {
              className: "sub",
              children: [
                ((n.qty / n.goal) * 100).toFixed(1),
                "% · 남은 ",
                (n.goal - n.qty).toFixed(5),
                " ",
                n.symbol,
                " ≈ ",
                formatNumber((n.goal - n.qty) * t.last, 0),
                "원",
              ],
            }),
          ],
        }),
      p &&
        jsxs("dl", {
          className: "pos",
          children: [
            jsxs("div", {
              children: [
                jsx("dt", { children: "보유" }),
                jsxs("dd", {
                  children:
                    t.country === "CRYPTO"
                      ? [Number(p.qty.toFixed(8)), " ", t.watch?.code ?? ""]
                      : [formatNumber(p.qty, 0), "주"],
                }),
              ],
            }),
            jsxs("div", {
              children: [
                jsx("dt", { children: "평단" }),
                jsxs("dd", {
                  children: [quoteUnit(t) === "$" ? "$" : "", formatQuotePrice(t, p.avg)],
                }),
              ],
            }),
            jsxs("div", {
              children: [
                jsx("dt", { children: "평가손익" }),
                jsx("dd", { className: changeClass(y), children: $n(y) }),
              ],
            }),
          ],
        }),
      jsxs("div", {
        className: "rail",
        style: { height: u },
        role: "list",
        "aria-label": "내 가격선",
        children: [
          jsx("span", { className: "rail-bar", "aria-hidden": "true" }),
          d.map((x, S) => {
            let g = (x.price / t.last - 1) * 100;
            return jsxs(
              "div",
              {
                role: "listitem",
                className: `rung rung-${x.kind}`,
                style: { top: x.y },
                children: [
                  jsx("span", {
                    className: "rung-tick",
                    "aria-hidden": "true",
                  }),
                  jsx("span", { className: "rung-label", children: x.label }),
                  jsx("span", {
                    className: "rung-price",
                    children: formatQuotePrice(t, x.price),
                  }),
                  jsx("span", {
                    className: "rung-dist",
                    children: x.kind === "now" ? "" : $n(g),
                  }),
                ],
              },
              S,
            );
          }),
        ],
      }),
      !t.watch?.lines.length &&
        t.kind === "watch" &&
        jsx("p", { className: "sub", children: "걸어 둔 관심가가 없어요." }),
      t.kind !== "watch" &&
        t.country !== "CRYPTO" &&
        jsx("p", {
          className: "sub",
          children: "내 종목이 아니라 평단·관심가 없이 1년 범위만 보여요.",
        }),
    ],
  });
}
function HeatmapPanel({ snap: t, pick: e, active: n }) {
  let [i, a] = React.useState("us"),
    o = i === "us" ? t.heat_us : t.heat_kr,
    r = o.filter((s) => s.chg > 0).length,
    l = React.useMemo(() => {
      let s = new Map();
      for (let c of o) {
        let d = s.get(c.sector) ?? { cap: 0, w: 0 };
        ((d.cap += c.cap), (d.w += c.cap * c.chg), s.set(c.sector, d));
      }
      return [...s.entries()]
        .map(([c, d]) => ({ k: c, chg: d.w / d.cap }))
        .sort((c, d) => d.chg - c.chg);
    }, [o]);
  return jsxs("section", {
    className: "heat",
    "aria-labelledby": "heat-h",
    children: [
      jsxs("header", {
        className: "heat-head",
        children: [
          jsx("h2", {
            id: "heat-h",
            className: "panel-h",
            children: "시가총액 히트맵",
          }),
          jsxs("div", {
            className: "seg",
            role: "tablist",
            "aria-label": "시장",
            children: [
              jsx("button", {
                role: "tab",
                "aria-selected": i === "us",
                className: i === "us" ? "on" : "",
                onClick: () => a("us"),
                type: "button",
                children: "나스닥100 상위",
              }),
              jsx("button", {
                role: "tab",
                "aria-selected": i === "kr",
                className: i === "kr" ? "on" : "",
                onClick: () => a("kr"),
                type: "button",
                children: "코스피 상위",
              }),
            ],
          }),
          jsxs("p", {
            className: "sub",
            children: [o.length, "종목 중 ", r, "개 상승 · 칸을 누르면 차트로"],
          }),
        ],
      }),
      jsxs("div", {
        className: "heat-body",
        children: [
          jsx(TreemapChart, {
            data: o.map((s) => ({
              id: s.sym,
              label: s.name,
              value: s.cap,
              change: s.chg,
              sublabel: $n(s.chg),
            })),
            height: 420,
            gap: 2,
            radius: 4,
            upColor: UP_COLOR,
            downColor: DOWN_COLOR,
            maxChange: 4,
            valueFormatter: (s) => formatMarketCap(s, i === "kr"),
            changeFormatter: $n,
            onItemClick: (s) => e(s.id),
            "aria-label": "시가총액과 등락률 히트맵",
          }),
          jsx("ol", {
            className: "sectors",
            "aria-label": "섹터 등락(시가총액 가중)",
            children: l.map((s) =>
              jsxs(
                "li",
                {
                  children: [
                    jsx("span", { children: s.k }),
                    jsx("span", {
                      className: "sec-bar",
                      "aria-hidden": "true",
                      children: jsx("i", {
                        className: changeClass(s.chg),
                        style: {
                          width: `${Math.min(100, (Math.abs(s.chg) / 4) * 100)}%`,
                        },
                      }),
                    }),
                    jsx("b", { className: changeClass(s.chg), children: $n(s.chg) }),
                  ],
                },
                s.k,
              ),
            ),
          }),
        ],
      }),
      n && null,
    ],
  });
}
function useCompactLayout() {
  let [e, n] = React.useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  return (
    React.useEffect(() => {
      let i = window.matchMedia("(max-width: 760px)"),
        a = () => n(i.matches);
      return (
        i.addEventListener?.("change", a),
        () => i.removeEventListener?.("change", a)
      );
    }, []),
    e
  );
}
// 기존 홈·관심종목·가격선·히트맵 레이아웃을 유지하는 최상위 화면.
function StockBoardApp() {
  let { snap: t, status: e, feed: n, error: i, busy: a, pull: o } = useBoardData(),
    r = useCompactLayout(),
    [l, s] = React.useState(() => {
      try {
        return localStorage.getItem("board:last") || "QLD";
      } catch {
        return "QLD";
      }
    }),
    [c, d] = React.useState("watch"),
    h = React.useMemo(() => (t ? buildRegistry(t) : new Map()), [t]),
    u = h.has(l) ? l : h.has("QLD") ? "QLD" : [...h.keys()][0],
    p = u ? h.get(u) : void 0,
    y = (x) => {
      if (!h.has(x)) return;
      s(x);
      try {
        localStorage.setItem("board:last", x);
      } catch {}
      if (r)
        document
          .querySelector(".quick-symbols, .stage")
          ?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    };
  if (e !== "ready" || !t || !n || !p)
    return jsx("main", {
      className: "empty",
      children: jsxs("div", {
        className: "empty-card",
        children: [
          jsx("h1", { className: "brand", children: "시장" }),
          e === "loading" &&
            jsx("p", {
              children:
                "시장 데이터를 불러오는 중이에요. 처음이면 새로 수집하느라 1~2분 걸려요.",
            }),
          e === "empty" &&
            jsx("p", {
              children:
                "아직 시장 데이터가 없어요. stock-advisor의 board 작업이 한 번 돌면 채워져요.",
            }),
          e === "offline" &&
            jsx("p", { children: i || "시장 데이터를 불러오지 못했어요." }),
          e === "setup" &&
            jsxs("p", {
              children: [
                "판단 일지와 같은 GitHub 토큰으로 시세를 읽어요. ",
                jsx("a", {
                  href: "log.html#/settings",
                  children: "판단 일지 설정",
                }),
                "에서 토큰을 먼저 넣어 주세요.",
              ],
            }),
        ],
      }),
    });
  return jsxs("div", {
    className: "shell",
    children: [
      jsxs("header", {
        className: "top",
        children: [
          jsx("h1", { className: "brand", children: "시장" }),
          jsxs("div", {
            className: "top-right",
            children: [
              jsxs("p", {
                className: "fresh",
                "aria-live": "polite",
                children: [
                  jsx("span", {
                    className: `dot ${a ? "is-busy" : ""}`,
                    "aria-hidden": "true",
                  }),
                  jsxs("span", {
                    className: "fresh-times",
                    children: [
                      jsx("span", {
                        children: a
                          ? `시세 ${formatUpdateTime(t.asof)} · ${a}`
                          : t.stale_quotes?.length
                            ? `시세 ${formatUpdateTime(t.asof)} 수집 · ${t.stale_quotes.length}종목 지연`
                            : `시세 ${formatUpdateTime(t.asof)} 완료`,
                      }),
                      jsx("span", {
                        children: t.history_asof
                          ? `자산 이력 ${formatUpdateTime(t.history_asof)} 완료${new Date(t.history_asof) < new Date(t.asof) ? " · 이전 수집분" : ""}`
                          : "자산 이력 갱신 대기",
                      }),
                    ],
                  }),
                ],
              }),
              jsx("span", {
                "data-theme-switch": !0,
                ref: (x) => x && window.saTheme?.mount(x),
              }),
              jsx("button", {
                type: "button",
                className: "btn",
                onClick: o,
                disabled: !!a,
                children: a ? "수집 중" : "새로 불러오기",
              }),
              !window.saFamily &&
                jsx("a", {
                  className: "btn",
                  href: "log.html#/today",
                  children: "오늘",
                }),
            ],
          }),
        ],
      }),
      i && jsx("p", { className: "alert", role: "alert", children: i }),
      !!t.stale_quotes?.length && jsx("p", {
        className: "alert", role: "status",
        children: window.saFamily ? "일부 종목의 최신 종가를 받지 못했습니다. 기존 가격은 최신 시세가 아닙니다."
          : `최신 거래일의 종가를 받지 못한 종목 ${t.stale_quotes.length}건: ${t.stale_quotes.map(x => `${x.sym} ${x.date || "미확인"} (필요 ${x.expected || "미확인"})`).join(" · ")}. 기존 가격은 최신 시세가 아닙니다.`,
      }),
      jsx(MacroTicker, { snap: t, reg: h, active: u, pick: y }),
      jsxs("div", {
        className: "market-links",
        children: [
          !window.saFamily && jsx("a", { href: "log.html#/market/levels", children: "관심가 전체" }),
          !window.saFamily && jsx("a", { href: "log.html#/market/etf", children: "ETF 구성 감시" }),
        ],
      }),
      jsxs("div", {
        className: "main",
        children: [
          r && jsx(QuickSymbols, { reg: h, active: u, pick: y }),
          jsx("section", {
            className: "stage",
            "aria-label": `${p.name} 차트`,
            children: jsx(ChartStage, {
              feed: n,
              symbol: u,
              onSymbol: (x) => h.has(x) && s(x),
              compact: r,
            }),
          }),
          r &&
            jsxs("div", {
              className: "seg seg-wide",
              role: "tablist",
              "aria-label": "보기",
              children: [
                jsx("button", {
                  role: "tab",
                  "aria-selected": c === "watch",
                  className: c === "watch" ? "on" : "",
                  onClick: () => d("watch"),
                  type: "button",
                  children: "관심종목",
                }),
                jsx("button", {
                  role: "tab",
                  "aria-selected": c === "levels",
                  className: c === "levels" ? "on" : "",
                  onClick: () => d("levels"),
                  type: "button",
                  children: "가격선",
                }),
                jsx("button", {
                  role: "tab",
                  "aria-selected": c === "heat",
                  className: c === "heat" ? "on" : "",
                  onClick: () => d("heat"),
                  type: "button",
                  children: "히트맵",
                }),
              ],
            }),
          jsxs("aside", {
            className: "side",
            hidden: r && c === "heat",
            children: [
              (!r || c === "watch") &&
                jsxs("div", {
                  className: "panel panel-watch",
                  children: [
                    jsx("h2", { className: "panel-h", children: "관심종목" }),
                    jsx(Watchlist, { reg: h, active: u, pick: y }),
                  ],
                }),
              (!r || c === "levels") &&
                jsx("div", {
                  className: "panel panel-ladder",
                  children: jsx(PriceLadder, { e: p, feed: n, crypto: t.crypto }),
                }),
            ],
          }),
        ],
      }),
      (!r || c === "heat") && jsx(HeatmapPanel, { snap: t, pick: y, active: u }),
      jsx("footer", {
        className: "foot",
        children:
          "열 때와 새로 불러오기를 누를 때 GitHub에서 새로 수집해요(30~40초). 시세는 yfinance라 거래소보다 늦을 수 있어요. 평단·관심가는 stock-advisor 설정을 따라요. 차트: Funnest Charts.",
      }),
    ],
  });
}
createRoot(document.getElementById("root")).render(jsx(StockBoardApp, {}));
