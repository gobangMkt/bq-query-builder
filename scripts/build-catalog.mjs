// 인벤토리(실측) + 텍소노미(계획) JSON을 병합해 src/data/catalog.json을 생성한다.
// 실행: npm run build:catalog

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export const PROJECT_ID = 'gobang-bigquery';

export const PROPERTY_META = {
  gobang: { datasetId: 'analytics_274122040', label: '고방' },
  uceo: { datasetId: 'analytics_279311003', label: 'U사장님' },
};

/**
 * 인벤토리 원문(JSON 배열 또는 NDJSON)을 레코드 배열로 파싱한다.
 * 숫자 필드(cnt/string_cnt/int_cnt/double_cnt)는 문자열로 들어올 수 있어 Number로 변환한다.
 */
export function parseInventory(raw) {
  const text = raw.trim();
  let rows;
  try {
    rows = JSON.parse(text);
    if (!Array.isArray(rows)) rows = [rows];
  } catch {
    // NDJSON: 줄 단위 JSON
    rows = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line));
  }

  return rows.map((row) => ({
    event_name: row.event_name,
    param_key: row.param_key,
    cnt: Number(row.cnt),
    string_cnt: Number(row.string_cnt),
    int_cnt: Number(row.int_cnt),
    double_cnt: Number(row.double_cnt),
  }));
}

/**
 * string_cnt vs (int_cnt + double_cnt) 다수결로 타입 결정.
 * string_cnt가 크거나 같으면 string.
 * numeric이 더 크면: int/double 모두 유의미 → 'numeric', double만 유의미 → 'numeric', int만 유의미 → 'int'.
 */
export function determineType(row) {
  const { string_cnt, int_cnt, double_cnt } = row;

  const numeric_cnt = int_cnt + double_cnt;

  // string_cnt 쪽이 크거나 같으면 string (동률 포함)
  if (string_cnt >= numeric_cnt) return 'string';

  // numeric_cnt 쪽이 더 크면
  if (int_cnt > 0 && double_cnt > 0) return 'numeric';
  if (double_cnt > 0) return 'numeric';
  return 'int';
}

function byCntDesc(a, b) {
  return b.cnt - a.cnt;
}

/**
 * 프로퍼티 하나(고방 또는 U사장님)의 인벤토리 레코드 + 텍소노미를 병합해
 * CatalogProperty.events 배열을 만든다.
 */
export function buildPropertyEvents(inventoryRows, taxonomy) {
  const taxonomyEvents = taxonomy?.events ?? {};

  /** @type {Map<string, { name: string; cnt: number; params: Map<string, any> }>} */
  const eventMap = new Map();

  for (const row of inventoryRows) {
    if (!eventMap.has(row.event_name)) {
      eventMap.set(row.event_name, { name: row.event_name, cnt: 0, params: new Map() });
    }
    const event = eventMap.get(row.event_name);
    event.cnt = Math.max(event.cnt, row.cnt);

    const paramTaxonomy = taxonomyEvents[row.event_name]?.params?.[row.param_key];
    const param = {
      key: row.param_key,
      type: determineType(row),
      cnt: row.cnt,
    };
    if (paramTaxonomy) param.description = paramTaxonomy;
    event.params.set(row.param_key, param);
  }

  return [...eventMap.values()]
    .map((event) => {
      const taxo = taxonomyEvents[event.name];
      const result = {
        name: event.name,
        label: taxo?.label ?? event.name,
        cnt: event.cnt,
        params: [...event.params.values()].sort(byCntDesc),
      };
      if (taxo?.description) result.description = taxo.description;
      if (taxo?.funnel) result.funnel = taxo.funnel;
      return result;
    })
    .sort(byCntDesc);
}

/**
 * 프로퍼티별 인벤토리 원문 + 텍소노미 객체 + 메타(datasetId/label)를 받아
 * catalog.json 전체 구조를 반환한다. 순수 함수 (파일 I/O 없음) — 테스트에서 직접 호출.
 */
export function buildCatalog({ gobangInventoryRaw, uceoInventoryRaw, gobangTaxonomy, uceoTaxonomy }) {
  const gobangRows = parseInventory(gobangInventoryRaw);
  const uceoRows = parseInventory(uceoInventoryRaw);

  return {
    projectId: PROJECT_ID,
    generatedAt: new Date().toISOString(),
    properties: {
      gobang: {
        ...PROPERTY_META.gobang,
        events: buildPropertyEvents(gobangRows, gobangTaxonomy),
      },
      uceo: {
        ...PROPERTY_META.uceo,
        events: buildPropertyEvents(uceoRows, uceoTaxonomy),
      },
    },
  };
}

function main() {
  const dataDir = path.join(ROOT, 'data');
  const gobangInventoryRaw = readFileSync(path.join(dataDir, 'inventory-gobang-20260702.json'), 'utf-8');
  const uceoInventoryRaw = readFileSync(path.join(dataDir, 'inventory-uceo-20260702.json'), 'utf-8');
  const gobangTaxonomy = JSON.parse(readFileSync(path.join(dataDir, 'taxonomy-gobang.json'), 'utf-8'));
  const uceoTaxonomy = JSON.parse(readFileSync(path.join(dataDir, 'taxonomy-uceo.json'), 'utf-8'));

  const catalog = buildCatalog({ gobangInventoryRaw, uceoInventoryRaw, gobangTaxonomy, uceoTaxonomy });

  const outPath = path.join(ROOT, 'src', 'data', 'catalog.json');
  writeFileSync(outPath, JSON.stringify(catalog, null, 2) + '\n', 'utf-8');

  const gobangCount = catalog.properties.gobang.events.length;
  const uceoCount = catalog.properties.uceo.events.length;
  console.log(`catalog.json 생성 완료: 고방 ${gobangCount}개 이벤트, U사장님 ${uceoCount}개 이벤트 → ${outPath}`);
}

// 직접 실행됐을 때만 main() 수행 (vitest에서 import 시 부작용 없음)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
