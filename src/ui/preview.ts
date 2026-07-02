// 구조 미리보기 — 선택한 차원/지표의 컬럼 헤더 + 더미값 3행.

import type { CatalogProperty } from '../data/catalog-types';
import type { DimensionSelection, MetricType } from '../sql/types';
import { computePreviewColumns, computePreviewRows } from '../utils/dummy';
import { escapeHtml } from '../utils/html';

export function renderPreviewHtml(
  property: CatalogProperty,
  dimensions: DimensionSelection[],
  metrics: MetricType[],
): string {
  const columns = computePreviewColumns(property, dimensions, metrics);

  if (columns.length === 0) {
    return `<p class="preview-empty">차원 또는 지표를 선택하면 미리보기가 표시됩니다.</p>`;
  }

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
    <p class="preview-caption">구조 확인용 더미값 — 실데이터 아님</p>
  `;
}
