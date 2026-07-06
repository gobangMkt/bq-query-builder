import catalogJson from './data/catalog.json';
import type { Catalog } from './data/catalog-types';
import { AUTH_STORAGE_KEY, ADMIN_STORAGE_KEY } from './config';
import { renderGate } from './ui/gate';
import { renderBuilder } from './ui/builder';
import { renderAdminGate, renderAdminPanel } from './ui/admin';

// JSON 리터럴 타입 추론(ParamType 등 유니온)이 정적 import와 완전히 맞지 않아 단언한다.
// 실제 값 검증은 scripts/build-catalog.test.ts(S1 소유)에서 담당.
const catalog = catalogJson as unknown as Catalog;

const root = document.querySelector<HTMLDivElement>('#app');

function startAdmin(el: HTMLDivElement): void {
  if (sessionStorage.getItem(ADMIN_STORAGE_KEY) === '1') {
    renderAdminPanel(el, catalog);
  } else {
    renderAdminGate(el, () => renderAdminPanel(el, catalog));
  }
}

function startMain(el: HTMLDivElement): void {
  if (sessionStorage.getItem(AUTH_STORAGE_KEY) === '1') {
    renderBuilder(el, catalog);
  } else {
    renderGate(el, () => renderBuilder(el, catalog));
  }
}

function start(): void {
  if (!root) return;
  if (location.hash === '#admin') {
    startAdmin(root);
  } else {
    startMain(root);
  }
}

window.addEventListener('hashchange', start);
start();
