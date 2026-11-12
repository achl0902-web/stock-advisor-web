# 판단 일지 (stock-advisor-web)

비공개 [stock-advisor](https://github.com/achl0902-web/stock-advisor) 저장소의 분석 결과를 휴대폰에서 보는 페이지입니다.

- **이 저장소에는 데이터가 없습니다.** 화면 코드만 있고, 페이지를 열 때 각자 기기에 저장한 읽기 전용 토큰으로 stock-advisor를 GitHub API로 읽어 옵니다. 토큰은 그 브라우저의 localStorage에만 있고 api.github.com 말고는 보내지 않습니다(CSP로 막아 둠).
- stock-advisor에 분석이 커밋되면 다음에 페이지를 열거나 새로고침할 때 바로 반영됩니다. 빌드 단계가 없습니다.
- 파일 내용은 blob sha 기준으로 캐시해서, 바뀐 파일만 다시 받습니다.

## 화면

| 탭 | 내용 | 읽는 파일 |
| --- | --- | --- |
| 오늘 | 최신 판단(도장·주문표·결론), QLD 챔피언 전략 상태, 최근 판단, 퇴직연금 정리 계획 진행, 성적 요약 | `runs/*/`, `config/price_alerts.json`, `reports/alerts_state.json`, back-testing `qld/data/status.json`(공개) |
| 판단 | 계좌별 판단 기록, 상세(주문표·최종 점검·리포트 본문) | `runs/<id>/final_decision.json`, `plan.json`, `checks.json`, `report.md` |
| 성적 | 기간별 방향 적중·초과수익·분할 효과, 판단별 벤치마크 대비 | `reports/scorecard.json`, `config/scorecard_notes.json` |
| 계좌 | 계좌별 보유·비중·평가손익, 퇴직연금 위험자산 70% 한도 | `config/accounts.json`, 계좌별 최근 `brief.json` |
| ETF | 426020 리밸런싱 일지와 사후 평가 | `etfwatch/reports/*.md` |
| 시세 (`sise.html`) | Funnest Charts 트레이딩 차트(지표·그리기 도구, 평단·관심가 선), 지수·선물·금리·환율·비트코인 띠, 관심종목, 내 가격선 사다리, 나스닥100·코스피 히트맵. 열 때(마지막 수집이 3분 넘었으면)와 새로 불러오기를 누를 때 `board` 워크플로를 실행해 새로 수집하고 끝나면 다시 그림(1~2분) | stock-advisor `board-data` 브랜치 |

색은 국내 시장 관례대로 상승·매수 빨강, 하락·매도 파랑이며 항상 부호·글자와 함께 씁니다. 바탕은 60-30-10(바탕·패널·형광 포인트) 다크 테마 하나이고, 위쪽 동그라미로 **블랙 라임**(기본)과 **에스프레소 민트**를 고릅니다. 선택은 `assets/theme.js`가 이 기기에 저장하고 판단 일지·시세·QLD 백테스터가 함께 씁니다.

## 처음 설정

1. 이 저장소 **Settings → Pages → Build and deployment**에서 Source를 **Deploy from a branch**, Branch를 **main / (root)**로 저장합니다. 1~2분 뒤 `https://achl0902-web.github.io/stock-advisor-web/` 에서 열립니다.
2. GitHub **Settings → Developer settings → Fine-grained tokens → Generate new token**
   - Repository access: **Only select repositories** → `stock-advisor`
   - Repository permissions: **Contents: Read-only** (Metadata 읽기는 자동). 시세 탭에서 새로 수집하려면 **Actions: Read and write**도 켭니다(워크플로 실행만 가능, 코드는 못 바꿈)
3. 페이지를 열고 토큰을 붙여 넣습니다. 휴대폰에서는 공유 → 홈 화면에 추가로 앱처럼 쓸 수 있습니다.

토큰이 만료되면 페이지가 연결 화면을 다시 띄웁니다. 기기를 잃어버리면 GitHub에서 토큰만 지우면 됩니다.

## 파일

- `index.html`: 뼈대와 CSP
- `assets/data.js`: GitHub REST 읽기, blob 캐시
- `assets/app.js`: 화면
- `assets/md.js`: 리포트용 작은 마크다운 렌더러(모든 원문 이스케이프, http(s) 링크만)
- `assets/app.css`: 스타일(다크 테마 두 가지)
- `assets/theme.js`: 테마 고르기(블랙 라임·에스프레소 민트)
- `sise.html`, `assets/sise.js`: 시세판. `assets/sise.js`는 Funnest Charts(Apache-2.0)와 React를 함께 묶은 빌드 결과물이라 직접 고치지 않습니다
