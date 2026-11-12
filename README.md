# 판단 일지 (stock-advisor-web)

비공개 [stock-advisor](https://github.com/achl0902-web/stock-advisor) 저장소의 분석 결과를 휴대폰에서 보는 페이지입니다.

- **이 저장소에는 데이터가 없습니다.** 화면 코드만 있고, 페이지를 열 때 각자 기기에 저장한 읽기 전용 토큰으로 stock-advisor를 GitHub API로 읽어 옵니다. 토큰은 그 브라우저의 localStorage에만 있고 api.github.com 말고는 보내지 않습니다(CSP로 막아 둠).
- stock-advisor에 분석이 커밋되면 다음에 페이지를 열거나 새로고침할 때 바로 반영됩니다. 빌드 단계가 없습니다.
- 파일 내용은 blob sha 기준으로 캐시해서, 바뀐 파일만 다시 받습니다.

## 화면

아래 탭 네 개(휴대폰은 떠 있는 탭, 넓은 화면은 왼쪽 레일)로 움직이고, 판단 일지와 시세판이 같은 탭을 씁니다.

| 탭 | 내용 | 읽는 파일 |
| --- | --- | --- |
| 오늘 (`#/`) | 최신 판단(도장·요지·주문 티켓), 걸어 둔 주문, 종목별 가장 가까운 관심가, 다가오는 날짜, QLD 챔피언 전략 상태, 최근 판단, 성적 요약 | `runs/*/`, `config/open_orders.json`, `config/price_alerts.json`, `reports/alerts_state.json`, back-testing `qld/data/status.json`(공개) |
| 기록 (`#/log`) | **판단**: 계좌별 판단 목록(채점 결과 함께), 상세(주문 티켓·채점·최종 점검·리포트 본문). **성적**: 기간별 방향 적중·초과수익·분할 효과, 판단별 벤치마크 대비 | `runs/<id>/final_decision.json`, `plan.json`, `checks.json`, `report.md`, `reports/scorecard.json`, `config/scorecard_notes.json` |
| 자산 (`#/assets`) | **계좌**: 전체 평가, 계좌별 보유·비중·평가손익, 퇴직연금 위험자산 70% 한도, 코인 목표 수량. **관심가**: 종목별 가격선 사다리(현재가 위치·거리)와 날짜 기준. **ETF**: 426020 리밸런싱 일지와 사후 평가 | `config/accounts.json`, `config/price_alerts.json`, `board-data` 브랜치 시세, 계좌별 최근 `brief.json`, `etfwatch/reports/*.md` |
| 시세 (`sise.html`) | Funnest Charts 트레이딩 차트(지표·그리기 도구, 평단·관심가 선), 지수·선물·금리·환율·비트코인 띠, 관심종목, 내 가격선 사다리, 나스닥100·코스피 히트맵. 열 때(마지막 수집이 3분 넘었으면)와 새로 불러오기를 누를 때 `board` 워크플로를 실행해 새로 수집하고 끝나면 다시 그림(1~2분) | stock-advisor `board-data` 브랜치 |

판단 기록은 최근 20건만 먼저 읽고, 기록 탭 아래 "더 불러오기"를 누를 때마다 50건씩 더 읽습니다. 성적표에서 아직 읽지 않은 판단을 누르면 그 판단 하나만 읽어 옵니다. 궁금해서 돌린 참고용 판단(`runs/<id>/reference.json`이 있는 판단)은 판단 일지·성적에서 빠집니다.

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

- `index.html`: 뼈대와 CSP
- `assets/tokens.css`: 판단 일지·시세판 공용 색·글꼴 토큰과 아래 탭 모양
- `assets/nav.js`: 공용 아래 탭(오늘·기록·자산·시세)
- `assets/theme.js`: 테마 고르기(블랙 라임·에스프레소 민트)
- `assets/data.js`: GitHub REST 읽기, blob 캐시(큰 JSON은 화면에 쓰는 부분만 추려 저장)
- `assets/store.js`: 화면이 쓰는 데이터 모델(판단·계좌 평가·관심가·성적 계산). `node --test test/store.test.mjs`로 확인
- `assets/ui.js`: 공통 조각(숫자·날짜 표기, 도장, 판단 표시, 주문 티켓, 판단 한 줄)
- `assets/app.js`: 연결·불러오기·화면 이동
- `assets/view-home.js`, `view-log.js`, `view-assets.js`: 탭별 화면
- `assets/md.js`: 리포트용 작은 마크다운 렌더러(모든 원문 이스케이프, http(s) 링크만)
- `assets/app.css`: 판단 일지 스타일
- `sise.html`, `assets/sise.js`: 시세판. `assets/sise.js`는 Funnest Charts(Apache-2.0)와 React를 함께 묶은 빌드 결과물이라 직접 고치지 않습니다(탭과 색은 `sise.html`이 공용 파일로 잇습니다)
