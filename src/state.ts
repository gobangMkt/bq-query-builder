import type { Catalog } from './data/catalog-types';
import { presetRange } from './utils/format';

export type PropertyKey = keyof Catalog['properties'];
export type DatePreset = 7 | 14 | 30 | null;

export interface AppState {
  property: PropertyKey;
  datePreset: DatePreset;
  dateFrom: string;
  dateTo: string;
  searchQuery: string;
  selectedEvents: Record<PropertyKey, Set<string>>;
}

const initialRange = presetRange(7);

export const state: AppState = {
  property: 'gobang',
  datePreset: 7,
  dateFrom: initialRange.from,
  dateTo: initialRange.to,
  searchQuery: '',
  selectedEvents: {
    gobang: new Set(),
    uceo: new Set(),
  },
};
