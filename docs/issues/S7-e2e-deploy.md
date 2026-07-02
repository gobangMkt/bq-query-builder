# S7 [의존: S6] E2E + 배포

## What to build
1. **E2E(Playwright)**: 게이트 통과 → 프로퍼티 선택 → 기간 → 이벤트 검색·선택 → 차원/지표 →
   미리보기 확인 → SQL 생성 → 복사, 그리고 기간 미선택 차단 시나리오
2. **GitHub 배포**: repo `gobangMkt/bq-query-builder`(public) 생성·push,
   GitHub Actions로 빌드→Pages 배포(vite `base` 경로 설정 주의)
3. **README.md**: for_Release 규칙 준수 — 개요/코어(스택·데이터흐름)/실행·배포(빌드 명령,
   비밀번호 상수 위치[값 미기재], 카탈로그 갱신 절차=verify-query.sql 재실행 파이프라인)/배포링크(프로덕션 URL + repo)
4. **시작 bat**: `시작 3095.bat` (vite dev 서버, 포트 3095 — 기존 포트와 중복 없음)

## Acceptance criteria
- [ ] E2E 전 시나리오 PASS
- [ ] 프로덕션 URL 접속 → 게이트 → SQL 생성까지 라이브 동작 확인
- [ ] README에 배포 URL·카탈로그 갱신 절차 기재
- [ ] 루트 커밋·푸시 완료, ahead/behind 0

## Blocked by
- S6
