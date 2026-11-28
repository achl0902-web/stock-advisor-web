// 수집 시각은 종가 날짜가 아니다. 휴장 중 페이지를 열 때마다 40초짜리
// GitHub Actions를 돌리지 않되, 정규장·코인 가격은 필요한 주기로 갱신한다.
const HOUR = 60 * 60 * 1000;

function localClock(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = type => parts.find(p => p.type === type)?.value;
  return { weekday: get("weekday"), minute: +get("hour") * 60 + +get("minute") };
}

function isWeekday(clock) {
  return clock.weekday !== "Sat" && clock.weekday !== "Sun";
}

export function shouldAutoCollect(snapshot, now = new Date()) {
  if (!snapshot?.asof) return false;
  const age = now.getTime() - Date.parse(snapshot.asof);
  if (!Number.isFinite(age) || age < 0) return false;
  const kr = localClock(now, "Asia/Seoul"), us = localClock(now, "America/New_York");
  const krOpen = isWeekday(kr) && kr.minute >= 9 * 60 && kr.minute <= 16 * 60;
  const usOpen = isWeekday(us) && us.minute >= 9 * 60 + 30 && us.minute <= 17 * 60;
  const crypto = snapshot.macro?.some(m => m.sym === "BTC-KRW") ||
    snapshot.watch?.some(w => w.market === "CRYPTO");
  // 장이 열려 있을 때 10분, 코인은 1시간. 휴장일 일반 시세 자동 수집은 생략.
  return ((krOpen || usOpen) && age >= 10 * 60 * 1000) || (crypto && age >= HOUR);
}
