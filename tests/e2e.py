# E2E: 게이트 → 대화형(AI 확인 단계·폴백·거절) → 셀렉형(문장·빌더·가드) — Python Playwright
# 실행: 서버(3095) 띄운 뒤 `python tests/e2e.py`  (배포 검증은 인자로 프로덕션 URL 전달)
# AI 프록시는 네트워크 모킹으로 대체한다(실 Gemini 호출·비용 0): 성공 응답 → 확인 단계 검증,
# 차단(abort) → 규칙파서 폴백 검증.
import json
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3095'
PROXY_GLOB = '**/script.google.com/**'
results = []
console_errors = []

MOCK_SQL = (
  "WITH base AS (SELECT 1 AS x) "
  "SELECT event_date, ad_banner_type, SAFE_DIVIDE(1, 2) AS ctr FROM base "
  "WHERE _TABLE_SUFFIX BETWEEN '20260101' AND '20260107' GROUP BY event_date"
)
MOCK_OK = {
  'ok': True,
  'sql': MOCK_SQL,
  'explanation': '최근 7일 배너 종류별 CTR을 계산합니다.',
  'corrected': False,
  'cached': False,
  'budget': {'spentKrw': 1, 'capKrw': 900},
}


def check(name, cond):
  results.append((name, bool(cond)))
  print(('PASS' if cond else 'FAIL') + ' - ' + name)


with sync_playwright() as p:
  b = p.chromium.launch()
  pg = b.new_page()
  # 폴백 시나리오의 프록시 차단(abort)이 내는 ERR_FAILED는 의도된 것이라 제외한다.
  pg.on(
    'console',
    lambda m: console_errors.append(m.text)
    if m.type == 'error' and 'ERR_FAILED' not in m.text
    else None,
  )

  # AI 프록시 모킹: 성공 응답 (확인 단계 시나리오)
  def fulfill_ok(route):
    route.fulfill(
      status=200,
      content_type='application/json',
      headers={'Access-Control-Allow-Origin': '*'},
      body=json.dumps(MOCK_OK),
    )

  pg.route(PROXY_GLOB, fulfill_ok)
  pg.goto(BASE)

  # 1. 게이트: 오답 → 에러
  pg.fill('.gate-input', 'wrong')
  pg.click('.gate-submit')
  check('게이트 오답 에러 노출', pg.locator('.gate-error').is_visible())

  # 2. 게이트: 정답 → 워크벤치(대화형 기본, 찾을 데이터는 입력방식 아래)
  pg.fill('.gate-input', 'gobang')
  pg.click('.gate-submit')
  pg.wait_for_selector('.top-bar')
  check('게이트 통과 → 워크벤치', pg.locator('.property-tab').count() == 2)
  check('기본 입력모드 = 대화형(질문 입력 노출)', pg.locator('.chat-input').is_visible())
  check('찾을 데이터가 입력방식 아래 배치', pg.locator('.wb-compose .property-tabs').count() == 1)

  # 3. 대화형(AI): 질문 → 확인 단계(SQL은 아직 숨김)
  pg.fill('.chat-input', '지난 한 주 배너 종류별 CTR')
  pg.click('.chat-parse-btn')
  pg.wait_for_selector('.chat-confirm-btn')
  check('확인 단계: 해석 카드 노출', pg.locator('.chat-answer-explain').count() == 1)
  check('확인 단계: 결과 컬럼 칩(3개)', pg.locator('.chat-confirm-cols .chat-answer-badge').count() == 3)
  check('확인 단계: 우측 미리보기에 AI 컬럼', 'ctr' in pg.inner_text('.preview-section'))
  check('확인 단계: 해석 문장 배너', '계산합니다' in pg.inner_text('.preview-sentence'))
  sql_panel = pg.inner_text('.sql-section')
  check('확인 전: SQL 미노출(안내만)', 'WITH base' not in sql_panel and '표시됩니다' in sql_panel)

  # 3b. 맞아요, 이대로 → SQL은 우측 패널에만
  pg.click('.chat-confirm-btn')
  pg.wait_for_timeout(200)
  check('확인 후: 우측 SQL 패널에 SQL', 'WITH base AS' in pg.inner_text('.sql-section'))
  check('확인 후: 좌측 채팅엔 SQL 본문 없음', 'WITH base AS' not in pg.inner_text('.chat-result'))
  check('확인 후: 복사 버튼(우측)', pg.locator('.chat-sql-copy-btn').count() == 1)

  # 4. 대화형(폴백): 프록시 차단 → 규칙파서 해석 칩
  pg.unroute(PROXY_GLOB)
  pg.route(PROXY_GLOB, lambda route: route.abort())
  pg.fill('.chat-input', '지난 한 주 동안, 찜 메모를 누른 사람 중 공고완독을 하지 않은 사람들이 발생시킨 조회수를 보고싶어')
  pg.click('.chat-parse-btn')
  pg.wait_for_selector('.chat-interp')
  check('폴백 고지 노출', pg.locator('.chat-fallback-note').count() == 1)
  check('되물음 칩(노란) 노출', pg.locator('.chat-choice').count() >= 1)
  check('미확정 상태에서 생성 버튼 비활성', pg.locator('.chat-generate-btn').is_disabled())

  # 4b. 되물음 칩을 모두 확정(확정 시 재렌더로 셀렉트 수 감소)
  guard = 0
  while pg.locator('.chat-choice').count() > 0 and guard < 10:
    pg.locator('.chat-choice').first.select_option(index=1)
    pg.wait_for_timeout(120)
    guard += 1
  check('모두 확정 후 생성 버튼 활성', pg.locator('.chat-generate-btn').is_enabled())

  # 4c. 생성 → 세그먼트 포함 SQL(폴백은 셀렉형 state 기반 SQL 섹션 사용)
  pg.click('.chat-generate-btn')
  pg.wait_for_timeout(300)
  body = pg.inner_text('body')
  check('폴백 SQL: WITH base', 'WITH base AS' in body)
  check('폴백 SQL: seg_users(사람 조건)', 'seg_users' in body)
  check('폴백 SQL: _TABLE_SUFFIX(비용가드)', '_TABLE_SUFFIX BETWEEN' in body)

  # 5. 대화형: 거절(순서 조건)
  pg.fill('.chat-input', '찜하고 나서 문의한 사람')
  pg.click('.chat-parse-btn')
  pg.wait_for_selector('.chat-reject')
  check('지원 불가 질문은 거절+대안', pg.locator('.chat-reject-suggestion').count() >= 1)

  # 6. 셀렉형 전환 — 조사형 문장 + 완성 문장 배너
  pg.click('.input-mode-btn[data-input-mode="select"]')
  pg.wait_for_selector('.input-panel-select:not(.is-hidden)')
  check('기간 프리셋(7/30/90) 노출', pg.locator('.date-preset').count() == 3)
  check('완성 문장 배너(셀렉형)', '데이터에서' in pg.inner_text('.preview-sentence'))

  # 7. 이벤트 모달로 선택 → 문장에 칩 반영
  pg.click('.ev-add-btn')
  pg.wait_for_selector('.event-modal:not(.is-hidden)')
  pg.fill('.event-search', 'quicksearch')
  pg.wait_for_timeout(150)
  pg.locator('.event-row').first.click()
  pg.wait_for_timeout(150)
  pg.click('.event-modal-done')
  pg.wait_for_timeout(200)
  check('선택 이벤트 칩 반영', pg.locator('.ev-chip').count() >= 1)
  check('이벤트 선택 후 조건·행·값 노출(progressive)', pg.locator('.compose-rest').is_visible())
  check('완성 문장에 이벤트 반영', '이벤트를' in pg.inner_text('.preview-sentence'))

  # 7b. 사람 조건 추가 → 생성
  before = pg.locator('.segment-row').count()
  pg.click('.segment-add')
  pg.wait_for_timeout(150)
  check('사람 조건 행 추가', pg.locator('.segment-row').count() == before + 1)
  pg.locator('.sql-generate-btn').click()
  pg.wait_for_timeout(200)
  body = pg.inner_text('body')
  check('셀렉형 SQL 생성(seg_users 포함)', 'seg_users' in body and 'WITH base AS' in body)

  # 8. 상세(Wide) 모드
  pg.locator('.mode-btn[data-mode="detail"]').click()
  pg.wait_for_selector('[data-column-key]')
  pg.locator('.sql-generate-btn').click()
  pg.wait_for_timeout(200)
  check('상세 SQL LIMIT 1000', 'LIMIT 1000' in pg.inner_text('body'))

  # 9. 기간 미선택 차단(가드) — 상시 노출 날짜 입력 비우기
  pg.locator('.mode-btn[data-mode="aggregate"]').click()
  pg.fill('.date-from', '')
  pg.fill('.date-to', '')
  pg.wait_for_timeout(150)
  check('기간 비우면 생성 버튼 비활성', pg.locator('.sql-generate-btn').is_disabled())

  # 9b. 상단 이벤트 사전 버튼으로 모달 열기(셀렉형에서 노출)
  pg.click('.dict-open-btn')
  check('이벤트 사전 버튼 → 모달 열림', pg.locator('.event-modal:not(.is-hidden)').count() >= 1)
  pg.click('.event-modal-close')

  # 10. 새로고침 → 세션 유지
  pg.reload()
  pg.wait_for_selector('.top-bar')
  check('새로고침 세션 유지', pg.locator('.gate-input').count() == 0)

  b.close()

check('콘솔 에러 0건', len(console_errors) == 0)
if console_errors:
  print('console errors:', console_errors[:5])

failed = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(failed)}/{len(results)} PASS')
if failed:
  raise SystemExit('FAILED: ' + ', '.join(failed))
