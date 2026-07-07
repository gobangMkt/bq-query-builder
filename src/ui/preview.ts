// 구조 미리보기 — 선택한 차원/지표의 컬럼 헤더 + 더미값 3행.

import type { CatalogProperty } from '../data/catalog-types';
import type { DimensionSelection, MetricType } from '../sql/types';
import {
  computePreviewColumns,
  computePreviewRows,
  computeWidePreviewColumns,
  type PreviewColumn,
} from '../utils/dummy';
import { escapeHtml } from '../utils/html';

function renderPreviewTableHtml(columns: PreviewColumn[]): string {
  const rows = computePreviewRows(columns);

  const theadHtml = `
    <thead>
      <tr>${columns.map((c) => `<th>${escapeHtml(c.name)}</th>`).join('')}</tr>
    </thead>
  `;

  const tbodyHtml = `
    <tbody>
      ${rows
        .map((row) => `<tr>${row.map((v) => `<td>${escapeHtml(v)}</td>`).join('')}</tr>`)
        .join('')}
    </tbody>
  `;

  return `
    <div class="preview-table-wrap">
      <table class="preview-table">${theadHtml}${tbodyHtml}</table>
    </div>
    <p class="preview-caption">실데이터 형태의 예시 값 — 실제 조회 결과는 아님</p>
  `;
}

export function renderPreviewHtml(
  property: CatalogProperty,
  dimensions: DimensionSelection[],
  metrics: MetricType[],
): string {
  const columns = computePreviewColumns(property, dimensions, metrics);

  if (columns.length === 0) {
    return `<p class="preview-empty">차원 또는 지표를 선택하면 미리보기가 표시됩니다.</p>`;
  }

  return renderPreviewTableHtml(columns);
}

// 대화형(AI) 결과 — SQL에서 추출한 컬럼명으로 구조를 보여준다. 타입은 이름으로 추정.
function guessKind(name: string): PreviewColumn['kind'] {
  if (/date|_day$|^day/i.test(name)) return 'date';
  if (/count|users|sessions|ctr|rate|ratio|pct|percent|avg|sum|total|cnt|clicks|views|impressions/i.test(name)) {
    return 'numeric';
  }
  return 'string';
}

export function renderAiPreviewHtml(columns: string[]): string {
  if (columns.length === 0) {
    return `<p class="preview-empty">결과 컬럼을 추정하지 못했어요. 생성된 SQL을 직접 확인해 주세요.</p>`;
  }
  return renderPreviewTableHtml(columns.map((name) => ({ name, kind: guessKind(name) })));
}

// S6: 상세(Wide) 모드 — 기본 컬럼이 항상 있으므로 "비어있음" 상태가 없다.
export function renderWidePreviewHtml(property: CatalogProperty, columns: string[]): string {
  const previewColumns = computeWidePreviewColumns(property, columns);
  return renderPreviewTableHtml(previewColumns);
}
