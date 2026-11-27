# 시세 차트 소스 관리

`assets/sise.js`는 React, Funnest Charts 및 시세판 전용 코드를 합친 배포 번들입니다.
차트 라이브러리 원본은 [funnest-xyz/funnest-charts](https://github.com/funnest-xyz/funnest-charts)(Apache-2.0)에서 제공됩니다.

현재 **시세판 애플리케이션 자체의 원본 JSX/TSX와 빌드 잠금 파일은 이 저장소에 없습니다.** 따라서 번들을 임의로 역컴파일하거나 직접 수정해 새 기능을 넣으면 회귀 위험이 큽니다.

이번 개선은 HTML/CSS 계층의 화면 배치와 독립된 `assets/home.js`/`assets/board-sync.js`에 한정합니다. 내부 차트의 시간 축·지표·거래 표시 동작은 그대로 둡니다.

## 남은 작업

1. 기존 시세판 애플리케이션 원본을 회수하거나 현재 기능을 동등하게 구현합니다.
2. React와 Funnest Charts의 사용 버전을 고정하고 잠금 파일을 추가합니다.
3. `npm ci` → 빌드 → 차트 기능 테스트로 번들을 재생성한 후 수동 수정본을 교체합니다.
4. iPhone Safari에서 종목 변경, 기간(60분/일/주/월), 좌우 이동, 핀치 확대, 내 체결 ▲▼를 확인합니다.

현 단계의 `npm run check`는 앱·번들의 구문과 데이터/UI 관련 회귀 테스트만 검증합니다. 번들의 동일 재생성은 아직 지원하지 않습니다.
