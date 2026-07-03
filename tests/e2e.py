# E2E: 게이트 → 대화형(해석·거절) → 셀렉형(사이드바·빌더·가드) — Python Playwright
# 실행: 서버(3095) 띄운 뒤 `python tests/e2e.py`  (배포 검증은 인자로 프로덕션 URL 전달)
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3095'
results = []
console_errors = []


def check(name, cond):
  results.append((name, bool(cond)))
  print(('PASS' if cond else 'FAIL') + ' - ' + name)


with sync_playwright() as p:
  b = p.chromium.launch()
  pg = b.new_page()
  pg.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)
  pg.goto(BASE)

  # 1. 게이트: 오답 → 에러
  pg.fill('.gate-input', 'wrong')
  pg.click('.gate-submit')
  check('게이트 오답 에러 노출', pg.locator('.gate-error').is_visible())

  # 2. 게이트: 정답 → 워크벤치(대화형 기본)
  pg.fill('.gate-input', 'gobang')
  pg.click('.gate-submit')
  pg.wait_for_selector('.top-bar')
  check('게이트 통과 → 워크벤치', pg.locator('.property-tab').count() == 2)
  check('기본 입력모드 = 대화형(칩 입력 노출)', pg.locator('.chat-input').is_visible())

  # 3. 대화형: 예시 문장 → 해석 칩
  pg.click('.chat-example-btn')
  pg.wait_for_selector('.chat-interp')
  check('되물음 칩(노란) 노출', pg.locator('.chat-choice').count() >= 1)
  check('미확정 상태에서 생성 버튼 비활성', pg.locator('.chat-generate-btn').is_disabled())

  # 3b. 되물음 칩을 모두 확정(확정 시 재렌더로 셀렉트 수 감소)
  guard = 0
  while pg.locator('.chat-choice').count() > 0 and guard < 10:
    pg.locator('.chat-choice').first.select_option(index=1)
    pg.wait_for_timeout(120)
    guard += 1
  check('모두 확정 후 생성 버튼 활성', pg.locator('.chat-generate-btn').is_enabled())

  # 3c. 생성 → 세그먼트 포함 SQL
  pg.click('.chat-generate-btn')
  pg.wait_for_timeout(300)
  body = pg.inner_text('body')
  check('대화형 SQL: WITH base', 'WITH base AS' in body)
  check('대화형 SQL: seg_users(사람 조건)', 'seg_users' in body)
  check('대화형 SQL: _TABLE_SUFFIX(비용가드)', '_TABLE_SUFFIX BETWEEN' in body)

  # 4. 대화형: 거절(순서 조건)
  pg.fill('.chat-input', '찜하고 나서 문의한 사람')
  pg.click('.chat-parse-btn')
  pg.wait_for_selector('.chat-reject')
  check('지원 불가 질문은 거절+대안', pg.locator('.chat-reject-suggestion').count() >= 1)

  # 5. 셀렉형 전환 — 상단 카테고리
  pg.click('.input-mode-btn[data-input-mode="select"]')
  pg.wait_for_selector('.input-panel-select:not(.is-hidden)')
  check('셀렉형 전환 시 기간 pill 노출(7/14/30/직접)', pg.locator('.date-pill').count() == 4)
  # 대화형에서 이미 이벤트가 잡혀 rest가 보일 수 있으니, 초기 단순화는 별도 확인 없이 진행

  # 6. 이벤트 모달로 선택 → 문장에 칩 반영
  # (앞선 대화형 단계에서 일부 이벤트가 이미 잡혀 있을 수 있어, 아직 안 잡힌 quicksearch로 추가)
  pg.click('.ev-add-btn')
  pg.wait_for_selector('.event-modal:not(.is-hidden)')
  pg.fill('.event-search', 'quicksearch')
  pg.wait_for_timeout(150)
  # 모달 안에서 이벤트 사전 ⓘ 확인
  pg.locator('.event-dict-toggle').first.click()
  check('이벤트 사전 팝오버(모달 내) 표시', pg.locator('.event-dict[open] .event-dict-body').count() >= 1)
  pg.locator('.event-row').first.click()
  pg.wait_for_timeout(150)
  pg.click('.event-modal-done')
  pg.wait_for_timeout(200)
  check('선택 이벤트 칩 반영', pg.locator('.ev-chip').count() >= 1)
  check('이벤트 선택 후 조건·행·값 노출(progressive)', pg.locator('.compose-rest').is_visible())

  # 6b. 사람 조건 추가 → 생성
  before = pg.locator('.segment-row').count()
  pg.click('.segment-add')
  pg.wait_for_timeout(150)
  check('사람 조건 행 추가', pg.locator('.segment-row').count() == before + 1)
  pg.locator('.sql-generate-btn').click()
  pg.wait_for_timeout(200)
  body = pg.inner_text('body')
  check('셀렉형 SQL 생성(seg_users 포함)', 'seg_users' in body and 'WITH base AS' in body)

  # 7. 상세(Wide) 모드
  pg.locator('.mode-btn[data-mode="detail"]').click()
  pg.wait_for_selector('[data-column-key]')
  pg.locator('.sql-generate-btn').click()
  pg.wait_for_timeout(200)
  check('상세 SQL LIMIT 1000', 'LIMIT 1000' in pg.inner_text('body'))

  # 8. 기간 미선택 차단(가드) — 직접 선택으로 날짜 입력 펼친 뒤 비우기
  pg.locator('.mode-btn[data-mode="aggregate"]').click()
  pg.locator('.date-pill[data-custom="1"]').click()
  pg.wait_for_selector('.date-from')
  pg.fill('.date-from', '')
  pg.fill('.date-to', '')
  pg.wait_for_timeout(150)
  check('기간 비우면 생성 버튼 비활성', pg.locator('.sql-generate-btn').is_disabled())

  # 8b. 상단 이벤트 사전 버튼으로 모달 열기
  pg.click('.dict-open-btn')
  check('이벤트 사전 버튼 → 모달 열림', pg.locator('.event-modal:not(.is-hidden)').count() >= 1)
  pg.click('.event-modal-close')

  # 9. 새로고침 → 세션 유지
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
