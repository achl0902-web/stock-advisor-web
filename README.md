# 판단 일지 (stock-advisor-web)

비공개 [stock-advisor](https://github.com/achl0902-web/stock-advisor) 저장소의 분석 결과를 휴대폰에서 보는 페이지입니다.

- **이 저장소에는 데이터가 없습니다.** 화면 코드만 있고, 페이지를 열 때 각자 기기에 저장한 읽기 전용 토큰으로 stock-advisor를 GitHub API로 읽어 옵니다. 토큰은 그 브라우저의 localStorage에만 있고 api.github.com 말고는 보내지 않습니다(CSP로 막아 둠).
- stock-advisor에 분석이 커밋되면 다음에 페이지를 열거나 새로고침할 때 바로 반영됩니다. 빌드 단계가 없습니다.
- 파일 내용은 blob sha 기준으로 캐시해서, 바뀐 파일만 다시 받습니다.

## 화면

아래 탭 세 개(홈·자산·기록, 휴대폰은 떠 있는 탭, 넓은 화면은 왼쪽 레일)로 움직이고, 판단 일지와 시세판이 같은 탭을 씁니다. 첫 주소(`index.html`)가 홈(시세판)이고, 판단 일지는 `log.html`입니다. 예전 주소(`./#/log`, `sise.html`)는 알맞은 화면으로 넘어갑니다.

| 탭 | 내용 | 읽는 파일 |
| --- | --- | --- |
| 홈 (`index.html`, 첫 주소) | 시세 띠 바로 아래 **QLD 챔피언 전략 상태·가까운 관심가·주요 일정**(오늘 앞뒤 30일: FOMC·CPI·고용, 실적, 휴장일, 내 공시·ETF 리밸런싱. `assets/home.js`). 그 아래 Funnest Charts 트레이딩 차트(지표·그리기 도구, 평단·관심가 선), 지수·선물·금리·환율·비트코인 띠, 관심종목, 내 가격선 사다리, 나스닥100·코스피 히트맵. 열 때(마지막 수집이 3분 넘었으면)와 새로 불러오기를 누를 때 `board` 워크플로를 실행해 새로 수집하고 끝나면 다시 그림(30~40초) | stock-advisor `board-data` 브랜치, `reports/events.json`, `config/price_alerts.json`, `reports/alerts_state.json`, back-testing `qld/data/status.json`(공개) |
| 자산 (`#/assets`) | **계좌**: 바로 쓸 수 있는 돈(주 계좌·바이오). 계좌 구성에서 전체·주 계좌·바이오 중 하나를 고르면 그 칸에 기간(버튼·양쪽 슬라이더)별 투자성과(투자손익·투자수익률·기초/기말 평가금액·순 입출금·투자원금, 입출금 제외)와 평가액·투자원금 추이, 계좌 구성·종목 구성 도넛, 보유·평가손익. **연금** (`#/assets/pension`): 퇴직연금 DC(추이·종목 구성, 위험자산 70% 한도). **코인** (`#/assets/crypto`): 크립토 계좌(추이·목표 수량). 둘 다 바로 쓸 돈이 아니라 계좌 탭 합계에 넣지 않는다. | `config/accounts.json`, `board-data` 브랜치 시세·평가액 추이(`networth--history.json`), 계좌별 최근 `brief.json` |
| 기록 (`#/log`) | **판단**: 위쪽에 최신 판단(도장·요지·주문 티켓), 걸어 둔 주문, 다가오는 날짜, 성적 요약. 그 아래 계좌별 판단 목록(채점 결과 함께), 상세(주문 티켓·채점·최종 점검·리포트 본문). **성적**: 기간별 방향 적중·초과수익·분할 효과, 판단별 벤치마크 대비. **관심가** (`#/log/levels`): 종목별 가격선 사다리(현재가 위치·거리)와 날짜 기준. **ETF** (`#/log/etf`): 426020 리밸런싱 일지와 사후 평가 | `runs/*/`, `config/open_orders.json`, `runs/<id>/final_decision.json`, `plan.json`, `checks.json`, `report.md`, `reports/scorecard.json`, `config/scorecard_notes.json`, `config/price_alerts.json`, `etfwatch/reports/*.md` |

판단 기록은 최근 20건만 먼저 읽고, 기록 탭 아래 "더 불러오기"를 누를 때마다 50건씩 더 읽습니다. 성적표에서 아직 읽지 않은 판단을 누르면 그 판단 하나만 읽어 옵니다. 궁금해서 돌린 참고용 판단(`runs/<id>/reference.json`이 있는 판단)은 판단 일지·성적에서 빠집니다.

평가액 추이는 시세판 수집 때 stock-advisor가 계좌 설정의 변경 기록과 그날 종가로 다시 계산합니다(입금·출금 포함). 투자손익 = 기말 − 기초(시작일 전날 마감) − 순 입출금, 투자수익률 = 투자손익 ÷ 투자원금(기초 + 순 입출금)으로 증권사 투자성과와 같은 식입니다. 계좌 탭의 원/$ 단추로 달러 기준을 고르면 날마다 그날 환율로 평가액·입출금을 달러로 바꿔 같은 식으로 계산하고, 실현손익·배당은 달러 원가로 다시 잰 값(`realized_usd`·`income_usd`)을 씁니다.

계좌 평가와 관심가까지의 거리는 종목별로 가장 최근 시세(판단 시점·가격 알림 점검·시세판 수집 중 늦은 것)로 계산합니다. 시세가 오래됐으면 시세 탭을 한 번 열어 새로 수집하면 됩니다.

색은 국내 시장 관례대로 상승·매수 빨강, 하락·매도 파랑이며 항상 부호·글자와 함께 씁니다. 바탕은 60-30-10(바탕·패널·형광 포인트) 다크 테마 하나이고, 위쪽 동그라미로 **블랙 라임**(기본)과 **에스프레소 민트**를 고릅니다. 선택은 `assets/theme.js`가 이 기기에 저장하고 판단 일지·시세·QLD 백테스터가 함께 씁니다. 색·글꼴 값은 `assets/tokens.css` 한 곳에 있습니다.

## 처음 설정

1. 이 저장소 **Settings → Pages → Build and deployment**에서 Source를 **Deploy from a branch**, Branch를 **main / (root)**로 저장합니다. 1~2분 뒤 `https://achl0902-web.github.io/stock-advisor-web/` 에서 열립니다.
2. GitHub **Settings → Developer settings → Fine-grained tokens → Generate new token**
   - Repository access: **Only select repositories** → `stock-advisor`
   - Repository permissions: **Contents: Read-only** (Metadata 읽기는 자동). 시세 탭에서 새로 수집하려면 **Actions: Read and write**도 켭니다(워크플로 실행만 가능, 코드는 못 바꿈)
3. 페이지를 열고 토큰을 붙여 넣습니다. 휴대폰에서는 공유 → 홈 화면에 추가로 앱처럼 쓸 수 있습니다.

토큰이 만료되면 페이지가 연결 화면을 다시 띄웁니다. 기기를 잃어버리면 GitHub에서 토큰만 지우면 됩니다.

## 파일

- `log.html`: 판단 일지 뼈대와 CSP
- `assets/tokens.css`: 판단 일지·시세판 공용 색·글꼴 토큰과 아래 탭 모양
- `assets/nav.js`: 공용 아래 탭(오늘·기록·자산·시세)
- `assets/theme.js`: 테마 고르기(블랙 라임·에스프레소 민트)
- `assets/data.js`: GitHub REST 읽기, blob 캐시(큰 JSON은 화면에 쓰는 부분만 추려 저장)
- `assets/store.js`: 화면이 쓰는 데이터 모델(판단·계좌 평가·관심가·성적 계산). `node --test test/store.test.mjs`로 확인
- `assets/chart.js`: 도넛과 평가액 추이 선(SVG, 누르거나 올리면 그날 값)
- `assets/ui.js`: 공통 조각(숫자·날짜 표기, 도장, 판단 표시, 주문 티켓, 판단 한 줄)
- `assets/app.js`: 연결·불러오기·화면 이동
- `assets/update.js`: 새로 배포된 화면 파일이 있으면 한 번 다시 연다(판단 일지·홈 공용)
- `assets/home.js`: 홈 패널(QLD 전략·가까운 관심가·주요 일정)
- `assets/view-home.js`, `view-log.js`, `view-assets.js`: 탭별 화면
- `assets/md.js`: 리포트용 작은 마크다운 렌더러(모든 원문 이스케이프, http(s) 링크만)
- `assets/app.css`: 판단 일지 스타일
- `index.html`(홈), `assets/sise.js`: 시세판. `sise.html`은 예전 주소를 홈으로 넘기는 빈 페이지. `assets/sise.js`는 Funnest Charts(Apache-2.0)와 React를 함께 묶은 빌드 결과물이라 직접 고치지 않습니다(예외: 차트의 trading 공급자에 `getExecutions`를 한 줄 덧대, 스냅샷 관심종목의 `fills`(내 매수·매도)를 차트에 ▲▼로 찍는다. 수집 완료 확인 간격 3초)(탭과 색은 `sise.html`이 공용 파일로 잇습니다)

## 가족 보기

`?view=family`로 한 번 열면 그 기기에서는 주 계좌·코인 자산과 시세만 보입니다(오늘·기록·퇴직연금·바이오·관심가·ETF 숨김). `?view=all`로 되돌립니다. 화면에서만 숨기는 것이라 토큰으로 저장소를 직접 보면 다른 계좌도 보입니다.
