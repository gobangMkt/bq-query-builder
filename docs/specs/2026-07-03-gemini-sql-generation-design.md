# BQ 쿼리빌더 v6 — 대화형 Gemini SQL 생성 (실행 없음) 설계

작성 2026-07-03. 상태: 확정(사용자 승인). 해제된 잠금은 **"LLM 0" 하나뿐**(→Gemini로 SQL 생성).

## 0. 경계 (절대 원칙)
- **사용자는 SQL을 손으로 안 친다** → Gemini가 자연어에서 SQL을 생성.
- **도구·LLM·Claude는 BigQuery에 쿼리를 직접 실행하지 않는다.** 산출물은 **SQL 텍스트**. 실행은 사람이 BQ 콘솔에서.
- dry-run / maximumBytesBilled / BigQuery Jobs 호출 등 실행 코드 **일절 없음**.

## 1. 왜 (노션 에이전트보다 나은 이유)
그냥 Gemini/노션 에이전트에 물으면: `analytics_274122040`의 실제 스키마를 몰라 **이벤트명·파람키 환각** → 안 도는 SQL.
이 도구의 차별점 = **실측 스키마 grounding + 카탈로그 검증 + 서식가드 + 무계정(키 프록시 보관)**.
→ 목표: 자연어 질문 → **실제로 도는(붙여넣으면 바로 실행되는) SQL** 을 생성. 규칙파서로 불가했던 CTR·비율도 처리.

## 2. 아키텍처
```
브라우저(정적 Pages)
   │  질문(자연어) + 프로퍼티(고방/U사장님) + 트림 스키마
   ▼
GAS 웹앱 프록시 (GEMINI_API_KEY 보관)
   ├─ Gemini 2.5 Flash: 지침 + 스키마 grounding → {sql, explanation}(JSON)
   └─ 출력가드 + 자가수정 1회
   ▼
브라우저: 한줄해석 + SQL(복사) + "BQ 콘솔에서 실행하세요" 안내
```
- **키**: `GEMINI_API_KEY` → GAS Script Properties에만. repo·클라이언트 절대 미노출.
- **BQ 자격증명 없음** — 프록시는 Gemini만 호출. BigQuery API 안 씀.
- **프록시 URL**: `src/config.ts` 상수(공개 무방).
- 스키마는 **클라이언트가 트림해서 전송**(카탈로그 단일 소스=클라이언트 빌드, 프록시는 stateless).

## 3. 대화형 = primary
- 입력: 자연어 질문 1개 + 프로퍼티.
- 출력: ①한줄해석(신뢰도) ②SQL(하이라이트+복사) ③"BQ 콘솔에 붙여넣어 실행" 안내.
- 규칙파서 해석칩/되물음 UX는 대화형에서 제거. CTR·비율·파람 타입별 분해 등 Gemini가 처리.
- **후속 질문**: 직전 질문·SQL을 맥락으로 유지해 "그중 모바일만" 식 이어가기.
- (선택·베스트에포트) BQ 콘솔 딥링크 — 긴 SQL은 URL 한계로 불안정하니 복사를 기본으로, 딥링크는 보조.

## 4. 셀렉형
- 그대로 유지 — 규칙 엔진(generate.ts) 결정적·무비용. Gemini 안 탐. 손대지 않음.

## 5. Gemini 프롬프트
- **지침**: 기존 스펙(2026-07-02) SQL 서식 — WITH base, COALESCE+SAFE_CAST, branch_type CASE 병합, `_TABLE_SUFFIX` 필수, 주석 블록. 출력은 JSON `{sql, explanation}`(responseSchema로 강제).
- **스키마(grounding)**: **선택 프로퍼티 1개만** 트림 — 이벤트명·파람키·타입. 고방/U사장님 동시 금지(131KB 과대). cnt 등 불요 필드 제거. dataLayer 상속·이벤트 간 값 스티칭 불가 명시.
- 모델: `gemini-2.5-flash`. 컨텍스트 캐싱으로 지침·카탈로그 재사용(비용↓).

## 6. 출력가드 (읽기전용·비용은 SQL 자체로)
- SQL이 `SELECT`/`WITH`로 시작(정규화 후). DML/DDL/스크립트 거부.
- `_TABLE_SUFFIX` 포함 강제 — 이게 유일한 비용안전(사람이 콘솔서 돌릴 때 풀스캔 방지).
- 대상 데이터셋만: `analytics_274122040`(고방)·`analytics_279311003`(U사장님).
- 카탈로그에 없는 이벤트명/파람키 참조 시 위반.
- **자가수정 1회**: 위반 내용을 Gemini에 되돌려 재생성. 2번째도 실패 → 실패 처리.

## 7. 폴백/실패
- 프록시 네트워크 실패 or Gemini 2회 실패 → 에러 배너 + "셀렉형으로 직접 조립" 유도.

## 8. 슬라이스
- **[독립] S1** GAS 프록시 스캐폴드 + Gemini 호출(NL+지침+트림스키마 → {sql, explanation}) + 키 Script Properties.
- **[의존:S1] S2** 출력가드 + 자가수정 1회.
- **[의존:S2] S3** 클라이언트 대화형: 질문→프록시→한줄해석+SQL(복사)+실행안내. 디자인 게이트. 폴백 배너.
- **[의존:S3] S4** 후속 질문(맥락 유지).
- **[의존:S3] S5** 배포(clasp, 키주입 HITL) + ad_banner CTR 문장 라이브검증(생성 SQL을 사용자가 콘솔서 1회 실행).

## 9. 배포/HITL
- clasp로 배포 시도(intakehub clasp v3 경험). 실패 시 사용자 스크립트에디터 수동.
- 사용자 필요: ①웹앱 배포(Anyone) ②`GEMINI_API_KEY` Script Property 주입.
- **BigQuery 권한/스코프 불필요**(실행 안 하므로).

## 10. 리스크
- Gemini SQL 정확도 → grounding+가드+자가수정으로 방어, 최종 라이브검증(S5).
- 비용: Gemini Flash 월 1만원 이하 예상. BQ 스캔비용은 사람이 콘솔서 실행 시 발생(SQL에 기간 강제로 통제).
