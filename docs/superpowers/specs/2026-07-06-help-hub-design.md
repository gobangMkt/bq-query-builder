# 도움말 허브 설계 (2026-07-06)

## 목적
처음 온 사용자가 이 도구 사용법과 "만든 SQL을 BigQuery에서 어떻게 돌리는지"를 한 곳에서 보게 한다.

## 결정 (brainstorming)
- **형태**: 중앙 모달 + 좌측 탭 (기존 이벤트/VoC 모달 톤 재사용)
- **이벤트 사전**: 도움말에 통합하지 않고 별도 상단 버튼 유지 (자주 여는 핵심 기능이라 접근성 우선)
- **스크린샷**: 우선 텍스트 단계 설명만. BQ 콘솔 스샷은 로그인 필요라 에이전트가 캡처 불가 → 이미지 슬롯만 구조에 두고 나중에 사용자가 제공 시 채움

## 진입점
top-bar 우측 액션 그룹 맨 앞에 `? 도움말` 버튼. 최종 순서: **도움말 · 이벤트 사전 · 의견 보내기** (모드 전환과 무관하게 고정).

## 탭 구성
1. **이용 방법** — 도구 소개 + 대화형/셀렉형/이벤트 사전 설명
2. **BQ에서 실행하기** — 5단계(복사 → 콘솔 열기 → 붙여넣기 → 실행 → 결과 확인) + BigQuery 콘솔 열기 CTA + 스캔량/비용 주의
3. **바로가기** — BigQuery 콘솔(gobang-bigquery) 링크

## 구조
- `src/help/help-content.ts` — 탭 문구·링크·(향후) 이미지 경로 데이터. UI와 분리해 수정 용이.
- `src/ui/help-widget.ts` — `mountHelpWidget(root)` self-contained(버튼 주입 + 모달 + 탭 전환 배선).
- `src/ui/icons.ts` — helpCircle, externalLink 아이콘 추가.
- CSS는 기존 모달 톤 재사용. `.help-step-img` 슬롯은 이미지가 있을 때만 렌더.

## BQ 콘솔 링크
`https://console.cloud.google.com/bigquery?authuser=4&project=gobang-bigquery&supportedpurview=project`

## 향후
각 실행 단계에 스크린샷을 넣으려면 `RUN_STEPS[n].image`에 경로를 채우면 위젯이 자동으로 `<img>`를 렌더한다.
