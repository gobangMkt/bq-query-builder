# E2E: 게이트 → 빌더 → SQL 생성 (집계/상세) — Python Playwright
# 실행: 서버(3095) 띄운 뒤 `python tests/e2e.py`
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:3095'
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

  # 2. 게이트: 정답 → 빌더 진입
  pg.fill('.gate-input', 'gobang')
  pg.click('.gate-submit')
  pg.wait_for_selector('.property-tabs')
  check('게이트 통과 → 빌더', pg.locator('.property-tab').count() == 2)

  # 3. 이벤트 미선택 → 생성 비활성 (비용가드)
  check('초기 생성버튼 비활성', pg.locator('.sql-generate-btn').is_disabled())

  # 4. 이벤트 검색·선택 → 생성 활성 (기본 7일 프리셋)
  pg.fill('.event-search', 'inquiry')
  pg.locator('.event-row').first.click()
  check('이벤트 선택 후 생성 활성', pg.locator('.sql-generate-btn').is_enabled())

  # 5. 지표 선택 + 생성 → 집계 SQL
  chips = pg.locator('[data-metric-key]')
  if chips.count() > 0 and 'is-selected' not in (chips.first.get_attribute('class') or ''):
    chips.first.click()
  pg.click('.sql-generate-btn')
  pg.wait_for_selector('.sql-code, pre code, .sql-block')
  body = pg.inner_text('body')
  check('집계 SQL 생성 (WITH base)', 'WITH base AS' in body)
  check('_TABLE_SUFFIX 포함 (비용가드)', '_TABLE_SUFFIX BETWEEN' in body)
  check('복사 버튼 존재', pg.locator('.sql-copy-btn').count() >= 1)

  # 6. 상세(Wide) 모드 → 컬럼 선택 UI + LIMIT
  pg.locator('.mode-btn').nth(1).click()
  pg.wait_for_selector('[data-column-key]')
  check('상세 모드 컬럼 칩 노출', pg.locator('[data-column-key]').count() > 0)
  pg.click('.sql-generate-btn')
  body = pg.inner_text('body')
  check('상세 SQL LIMIT 1000', 'LIMIT 1000' in body)

  # 7. 집계 모드 복귀 (회귀)
  pg.locator('.mode-btn').nth(0).click()
  check('집계 복귀 시 지표 UI', pg.locator('[data-metric-key]').count() > 0)

  # 8. 이벤트 해제 → 생성 비활성 (가드 복귀)
  pg.locator('.event-row.is-selected').first.click()
  check('이벤트 해제 시 생성 비활성', pg.locator('.sql-generate-btn').is_disabled())

  # 9. 새로고침 → 세션 유지
  pg.reload()
  pg.wait_for_selector('.property-tabs')
  check('새로고침 세션 유지', pg.locator('.gate-input').count() == 0)

  b.close()

check('콘솔 에러 0건', len(console_errors) == 0)
if console_errors:
  print('console errors:', console_errors[:5])

failed = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(failed)}/{len(results)} PASS')
if failed:
  raise SystemExit('FAILED: ' + ', '.join(failed))
