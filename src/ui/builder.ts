import type { Catalog } from '../data/catalog-types';
import { state } from '../state';
import type { PropertyKey } from '../state';
import { presetRange } from '../utils/format';
import { escapeHtml } from '../utils/html';
import { renderEventListHtml, renderSearchHtml } from './events-list';

const PRESETS: Array<{ days: 7 | 14 | 30; label: string }> = [
  { days: 7, label: '최근 7일' },
  { days: 14, label: '최근 14일' },
  { days: 30, label: '최근 30일' },
];

export function renderBuilder(root: HTMLElement, catalog: Catalog): void {
  root.innerHTML = shellHtml(catalog);

  const listEl = root.querySelector<HTMLElement>('.event-list')!;
  const searchSlot = root.querySelector<HTMLElement>('.event-search-slot')!;
  const dateFromInput = root.querySelector<HTMLInputElement>('.date-from')!;
  const dateToInput = root.querySelector<HTMLInputElement>('.date-to')!;
  const tabsEl = root.querySelector<HTMLElement>('.property-tabs')!;
  const chipsEl = root.querySelector<HTMLElement>('.date-chips')!;

  function renderList(): void {
    listEl.innerHTML = renderEventListHtml(catalog.properties[state.property]);
  }

  function renderSearch(): void {
    searchSlot.innerHTML = renderSearchHtml();
    const input = searchSlot.querySelector<HTMLInputElement>('.event-search')!;
    input.addEventListener('input', () => {
      state.searchQuery = input.value;
      renderList();
    });
  }

  function syncPresetChips(): void {
    chipsEl.querySelectorAll<HTMLButtonElement>('.date-chip').forEach((chip) => {
      chip.classList.toggle('is-selected', state.datePreset === Number(chip.dataset.days));
    });
  }

  function syncTabs(): void {
    tabsEl.querySelectorAll<HTMLButtonElement>('.property-tab').forEach((tab) => {
      const isActive = tab.dataset.property === state.property;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });
  }

  tabsEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.property-tab');
    if (!btn) return;
    const key = btn.dataset.property as PropertyKey;
    if (key === state.property) return;
    state.property = key;
    state.searchQuery = '';
    syncTabs();
    renderSearch();
    renderList();
  });

  chipsEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.date-chip');
    if (!btn) return;
    const days = Number(btn.dataset.days) as 7 | 14 | 30;
    const range = presetRange(days);
    state.datePreset = days;
    state.dateFrom = range.from;
    state.dateTo = range.to;
    dateFromInput.value = range.from;
    dateToInput.value = range.to;
    syncPresetChips();
  });

  dateFromInput.addEventListener('change', () => {
    state.dateFrom = dateFromInput.value;
    state.datePreset = null;
    syncPresetChips();
  });

  dateToInput.addEventListener('change', () => {
    state.dateTo = dateToInput.value;
    state.datePreset = null;
    syncPresetChips();
  });

  listEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.event-row');
    if (!btn) return;
    const name = btn.dataset.event;
    if (!name) return;
    const selected = state.selectedEvents[state.property];
    if (selected.has(name)) selected.delete(name);
    else selected.add(name);
    renderList();
  });

  renderSearch();
  renderList();
}

function shellHtml(catalog: Catalog): string {
  const properties = catalog.properties;
  const propertyKeys = Object.keys(properties) as PropertyKey[];

  return `
    <div class="builder">
      <header class="builder-header">
        <h1 class="builder-title">BQ 쿼리 빌더</h1>
      </header>

      <nav class="property-tabs" role="tablist" aria-label="프로퍼티">
        ${propertyKeys
          .map(
            (key) => `
              <button type="button" class="property-tab${key === state.property ? ' is-active' : ''}"
                role="tab" aria-selected="${key === state.property}" data-property="${key}">
                ${escapeHtml(properties[key].label)}
              </button>
            `,
          )
          .join('')}
      </nav>

      <section class="panel date-range">
        <h2 class="panel-title">기간</h2>
        <div class="date-chips">
          ${PRESETS.map(
            (p) => `
              <button type="button" class="date-chip${state.datePreset === p.days ? ' is-selected' : ''}"
                data-days="${p.days}">${p.label}</button>
            `,
          ).join('')}
        </div>
        <div class="date-inputs">
          <input type="date" class="date-from" value="${state.dateFrom}" aria-label="시작일" />
          <span class="date-sep">~</span>
          <input type="date" class="date-to" value="${state.dateTo}" aria-label="종료일" />
        </div>
      </section>

      <section class="panel event-section">
        <h2 class="panel-title">이벤트</h2>
        <div class="event-search-slot"></div>
        <div class="event-list"></div>
      </section>
    </div>
  `;
}
