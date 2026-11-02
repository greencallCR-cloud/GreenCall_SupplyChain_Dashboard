import { analyze } from '../src/core.mjs';
import { isValidDate, loadSnapshot as defaultLoadSnapshot, sanitizeSnapshot, snapshotFields, defaultViewStore } from './snapshot-store.mjs';
// Engine identity of this deploy: persisted views computed by other code are never reused.
const DEPLOY_ENGINE = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GREENCALL_VIEW_ENGINE || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40) || null;
const lazyViews = { store: undefined, async resolve() { if (this.store === undefined) { try { this.store = await defaultViewStore(); } catch { this.store = null; } } return this.store; } };
const defaultViews = { activeId: async () => (await lazyViews.resolve())?.activeId() ?? null, get: async (...a) => (await lazyViews.resolve())?.get(...a) ?? null, put: async (...a) => (await lazyViews.resolve())?.put(...a) };

const FILTERS = ['sku', 'tech', 'from', 'to', 'month', 'center', 'warehouse', 'technology'];
const invalidQuery = () => Object.assign(new Error('Los filtros o la paginación no son válidos.'), { code: 'INVALID_QUERY' });
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function validateFilter(input, extra = []) {
  if (!plain(input) || Object.keys(input).some(key => ![...FILTERS, ...extra].includes(key))) throw invalidQuery();
  const filter = {};
  for (const key of FILTERS) {
    const value = input[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'string' || value.length > (key === 'sku' ? 100 : 160) || /[\x00-\x1f\x7f]/.test(value)) throw invalidQuery();
    filter[key] = value.trim();
  }
  if (filter.from && !isValidDate(filter.from) || filter.to && !isValidDate(filter.to)) throw invalidQuery();
  if (filter.from && filter.to && filter.from > filter.to) throw invalidQuery();
  if (filter.month && !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(filter.month)) throw invalidQuery();
  return filter;
}
function positiveInteger(value, fallback, minimum) {
  if (value === undefined || value === '') return fallback;
  if (!['number', 'string'].includes(typeof value) || !/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum) throw invalidQuery();
  return Number(value);
}
const metadata = snapshot => ({ id: snapshot.id || null, captured_at: snapshot.captured_at || null });
const matches = (row, filter) => (!filter.sku || row.sku === filter.sku)
  && (!filter.tech || row.tech === filter.tech || row.location === filter.tech || row.tech_name === filter.tech)
  && (!filter.center || row.center === filter.center) && (!filter.warehouse || row.warehouse === filter.warehouse)
  && (!filter.technology || row.technology === filter.technology)
  && (!filter.from || String(row.date || row.cut || row.eta_cut || row.sap_cut || '') >= filter.from)
  && (!filter.to || Boolean(row.date || row.cut || row.eta_cut || row.sap_cut) && String(row.date || row.cut || row.eta_cut || row.sap_cut) <= filter.to)
  && (!filter.month || String(row.date || row.cut || row.eta_cut || row.sap_cut || '').startsWith(filter.month));

export {validateFilter as validateDataFilter,matches as matchesDataFilter};

/** Read path only. Authentication belongs to the HTTP handlers, before this factory is called. */
/** views (optional): persisted derived dashboards {activeId(), get(id,key), put(id,key,payload)}.
 * Keyed by snapshot id + engine version + filter, so new data or a new deploy never reuses an old
 * computation. Any view-store failure falls back to computing; it never breaks the dashboard. */
export function createDashboardService({ loadSnapshot = defaultLoadSnapshot, onAnalyze = () => {}, views, engine } = {}) {
  // Production defaults: persisted views only when using the real loader and a known deploy engine.
  if (views === undefined) views = loadSnapshot === defaultLoadSnapshot && DEPLOY_ENGINE ? defaultViews : null;
  if (engine === undefined) engine = DEPLOY_ENGINE;
  // Results depend only on (snapshot id, filter): memoize a few per warm instance.
  const memo = new Map();
  if (typeof loadSnapshot !== 'function') throw new TypeError('Se necesita un cargador privado de snapshots.');
  async function current() {
    const snapshot = await loadSnapshot();
    return snapshot ? { ...snapshot, data: sanitizeSnapshot(snapshot.data) } : null;
  }
  const remember = (key, value) => { memo.set(key, value); if (memo.size > 12) memo.delete(memo.keys().next().value); };
  const respond = ({ dashboard, snapshot }) => ({ ...dashboard, data_state: 'ready', snapshot, meta: { ...dashboard.meta, snapshot_id: snapshot.id, captured_at: snapshot.captured_at } });
  // In-flight dedupe: identical concurrent requests share one load + analysis (no thundering herd).
  const inflight = new Map();
  async function dashboardFor(filter, filterKey) {
    const pending = inflight.get(filterKey);
    if (pending) return pending;
    const job = compute(filter, filterKey).finally(() => inflight.delete(filterKey));
    inflight.set(filterKey, job);
    return job;
  }
  return {
    async getDashboard(input = {}) {
      const filter = validateFilter(input), filterKey = JSON.stringify(filter);
      return dashboardFor(filter, filterKey);
    },
    async getRows(input = {}) { return rowsFor(input); },
  };
  async function compute(filter, filterKey) {
      const viewKey = engine ? engine + '|' + filterKey : null;
      let activeId = null;
      if (views && viewKey) {
        try {
          activeId = await views.activeId();
          if (activeId) {
            const hit = memo.get(activeId + '|' + filterKey);
            if (hit) return respond(hit);
            const stored = await views.get(activeId, viewKey);
            if (stored?.dashboard && stored?.snapshot?.id === activeId) { remember(activeId + '|' + filterKey, stored); return respond(stored); }
          }
        } catch { activeId = null; }
      }
      const snapshot = await current();
      if (!snapshot) return null;
      const key = (snapshot.id || '') + '|' + filterKey;
      let entry = memo.get(key);
      if (!entry) {
        onAnalyze();
        entry = { dashboard: analyze(snapshot.data, {}, filter), snapshot: metadata(snapshot) };
        for (const k of memo.keys()) if (!k.startsWith((snapshot.id || '') + '|')) memo.delete(k);
        remember(key, entry);
        if (views && viewKey && snapshot.id) { try { await views.put(snapshot.id, viewKey, entry); } catch {} }
      }
      return respond(entry);
  }
  async function rowsFor(input = {}) {
      const filter = validateFilter(input, ['type', 'offset', 'limit', 'sort', 'dir', 'q']);
      const type = input.type || 'google_consumos', allowed = snapshotFields(type);
      if (!allowed || typeof type !== 'string') throw invalidQuery();
      const offset = positiveInteger(input.offset, 0, 0), limit = Math.min(200, positiveInteger(input.limit, 50, 1));
      const sort = input.sort ?? '', dir = input.dir || 'asc', q = input.q ?? '';
      if (typeof sort !== 'string' || sort && (!allowed.includes(sort) || sort.startsWith('_')) || !['asc', 'desc'].includes(dir) || typeof q !== 'string' || q.length > 160) throw invalidQuery();
      const snapshot = await current();
      if (!snapshot) return null;
      const search = q.toLocaleLowerCase('es');
      let rows = (snapshot.data.tables[type] || []).filter(row => matches(row, filter) && (!search || Object.entries(row).some(([key, value]) => !key.startsWith('_') && String(value ?? '').toLocaleLowerCase('es').includes(search))));
      if (sort) rows.sort((a, b) => {
        const left = a[sort], right = b[sort];
        if (left === null || left === undefined) return right === null || right === undefined ? 0 : 1;
        if (right === null || right === undefined) return -1;
        const difference = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), 'es', { numeric: true });
        return difference * (dir === 'desc' ? -1 : 1);
      });
      return { type, total: rows.length, offset, limit, rows: rows.slice(offset, offset + limit).map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_')))), snapshot: metadata(snapshot) };
  }
}
