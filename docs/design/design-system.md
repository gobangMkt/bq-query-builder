# BQ 쿼리 빌더 — 디자인 시스템 (확정)

2026-07-02 디자인 게이트 통과: **A. 콘솔 라이트** (`theme-options.png` 참조)

## 컨셉
BQ 콘솔과 나란히 두고 쓰는 도구 — 같은 라이트+블루 시각 문법으로 연속성 유지.
SQL 출력 블록만 다크 반전 → "복사해갈 코드" 영역임을 시각적으로 구분.

## 컬러 토큰

| 토큰 | 값 | 용도 |
|---|---|---|
| `--primary` | `#0B57D0` | 주 액션, 선택 상태, 활성 탭 |
| `--primary-soft` | `#E7EFFD` | 선택 칩 배경 |
| `--bg` | `#F8F9FB` | 페이지 배경 |
| `--surface` | `#FFFFFF` | 카드·칩·표 배경 |
| `--border` | `#DDE1E7` | 표·카드 테두리 |
| `--border-input` | `#C9D0DA` | 칩·인풋 테두리 |
| `--text` | `#1C2733` | 본문 |
| `--text-muted` | `#5F6A79` | 라벨·보조 텍스트 |
| `--table-head` | `#EEF1F5` | 표 헤더 배경 |
| `--code-bg` | `#1C2733` | SQL 블록 배경 (다크 반전) |
| `--code-text` | `#D7E3F4` | SQL 본문 |
| `--code-kw` | `#7FB5FF` | SQL 키워드 |
| `--danger` | `#C5221F` | 경고(90일 초과 등) — 아이콘+텍스트 동반, 색상 단독 금지 |

## 타이포그래피
- UI: **Pretendard** (로컬 폰트 스택 fallback: -apple-system, 'Malgun Gothic')
- 코드·컬럼명·더미값: **JetBrains Mono** (fallback: Consolas, monospace)
- 스케일: 13(라벨) / 15(본문·칩) / 17(섹션제목) / 22(페이지제목), 본문 line-height 1.5+
- 숫자 컬럼은 tabular figures

## 형태 규칙
- 라운딩: 6px(칩·버튼·코드블록), 8px(카드). 그 이상 금지
- 그림자: 카드 1단계(`0 2px 12px rgba(0,0,0,.12)`)만. 남발 금지
- 선택 상태: `--primary-soft` 배경 + `--primary` 테두리+텍스트 (색상+테두리+굵기 3중 표시)
- 아이콘: Lucide SVG만, 이모지 금지, stroke 1.5px 통일
- 안티클리셰 준수: border-left 액센트 도배 금지, pill 남발 금지, 그라데이션 금지

## 접근성
- 본문 대비 4.5:1 이상 (`#1C2733` on `#FFF` = 14.5:1, `#5F6A79` on `#FFF` = 5.6:1 ✓)
- 터치 타깃 44px 이상(칩 높이 포함), 포커스 링 유지
- 경고는 색+아이콘+텍스트 동반
