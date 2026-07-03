# Gemini SQL 생성 프록시 (GAS 웹앱)

대화형 탭이 부르는 백엔드. 자연어 질문 + 트림 스키마 → Gemini 2.5 Flash → **검증된 BigQuery SQL 텍스트**.
⚠️ **BigQuery에 쿼리를 실행하지 않는다.** SQL만 반환, 실행은 사람이 BQ 콘솔에서.

## 구성
- `Code.gs` — doPost 핸들러. Gemini 호출 + 출력가드 + 자가수정 1회 + **비용 하드캡** + 응답캐시.
- `appsscript.json` — 웹앱 매니페스트(소유자 권한 실행 / Anyone 접근 / external_request 스코프).

## 안전장치
- **비용 하드캡**: 월 누적 900원 도달 시 Gemini 호출 거부(`MONTHLY_BUDGET_KRW`). 절대 1000원 초과 불가.
- **응답 캐시**: 동일 질문 6h 재사용 → LLM 재호출 0.
- **출력가드**: SELECT/WITH 시작·`_TABLE_SUFFIX` 강제·허용 데이터셋만·카탈로그 밖 이벤트/파람 거부.

## Script Properties (배포 시 주입 필수)
| 키 | 값 | 필수 |
|---|---|---|
| `GEMINI_API_KEY` | Gemini API 키 (`~/.secrets/shared.env`의 값) | ✅ |
| `ACCESS_KEY` | 클라이언트 게이트 키 (`gobang`) | 선택(권장) |

## 배포 절차 (clasp)
> ⚠️ 현재 clasp 토큰 만료됨. 먼저 재로그인 필요:
> 프롬프트에 `! clasp login` 입력(브라우저 인증). 그 뒤 아래를 실행(또는 Claude에게 이어서 요청).

```bash
cd gas-proxy
clasp create-script --type standalone --title "BQ쿼리빌더 Gemini프록시"
clasp push -f
# 웹앱 배포
clasp create-deployment --description "v6 gemini proxy"
clasp list-deployments   # exec URL 확인(.../exec)
```

### 키 주입 (택1)
- **A. 편집기 수동**: Apps Script 편집기 → 프로젝트 설정 → 스크립트 속성 → `GEMINI_API_KEY`/`ACCESS_KEY` 추가.
- **B. 로컬 setup 파일(친자동)**: `gas-proxy/setup.local.gs`(gitignore됨) 생성 후 `clasp push` → 편집기에서 `setupSecrets_()` 1회 실행 → 파일 삭제.
  ```js
  function setupSecrets_() {
    PropertiesService.getScriptProperties().setProperties({
      GEMINI_API_KEY: '여기에_키',
      ACCESS_KEY: 'gobang'
    });
  }
  ```

## 배포 후 클라이언트 연결
1. exec URL(`https://script.google.com/macros/s/…/exec`)을 `src/config.ts`의 `PROXY_URL`에 기입.
2. `npm run build` → master push → GitHub Actions가 Pages 재배포.
3. 헬스체크: 브라우저로 exec URL 열면 `{ok:true, budget:{…}}` JSON.
4. 라이브검증: 대화형에 "지난주 배너 종류별 CTR 날짜순" → SQL 생성 → BQ 콘솔서 실행 확인.
