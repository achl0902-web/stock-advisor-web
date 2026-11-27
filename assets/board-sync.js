// 시세판은 별도로 빌드된 React 번들이다. 수집 완료를 직접 알리는 API가 없으므로
// 화면 상단 수집 시각과 '수집 중' 표시가 바뀌는 때만 홈 요약을 다시 읽는다.
export function snapshotTracker(onRefresh) {
  let last = null;
  let wasBusy = false;
  return ({ stamp, busy }) => {
    if (!stamp) return;
    if (last !== null && (last !== stamp || (wasBusy && !busy))) onRefresh();
    last = stamp;
    wasBusy = busy;
  };
}

export function observeBoardRefresh(root, onRefresh) {
  if (!root || typeof MutationObserver === "undefined") return () => {};
  const track = snapshotTracker(onRefresh);
  let fresh = null;
  let currentObserver = null;
  const check = () => {
    if (!fresh?.isConnected) return;
    const stamp = fresh.textContent.match(/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}/)?.[0] || "";
    track({ stamp, busy: !!fresh.querySelector(".dot.is-busy") });
  };
  const attach = () => {
    const found = root.querySelector(".fresh");
    if (!found || found === fresh) return;
    currentObserver?.disconnect();
    fresh = found;
    currentObserver = new MutationObserver(check);
    currentObserver.observe(fresh, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class"] });
    check();
  };
  const rootObserver = new MutationObserver(attach);
  rootObserver.observe(root, { childList: true });
  attach();
  return () => { rootObserver.disconnect(); currentObserver?.disconnect(); };
}
