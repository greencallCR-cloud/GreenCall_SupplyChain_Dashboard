// Synthetic regression: live stock rotation may shrink only when reconciled to a newer inventory cut.
// Financial histories with unexplained reductions must not be erased from a published snapshot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedRotationCut, reductionDecision, SheetsSync, SOURCE_TABS } from '../src/sheets-sync.mjs';

const inv = (n, cut) => Array.from({ length: n }, (_, i) => ({ serial: 'SER' + i, eta_cut: cut, sap_cut: cut }));
const rotation = (n) => Array.from({ length: n }, (_, i) => ({ serial: 'SER' + i, tech: 'TECH', date: '2026-10-01' }));

test('derived rotation can shrink when all unique serials match a newer inventory cut', () => {
  for (const type of ['rotation_tech', 'rotation_returns']) {
    assert.equal(verifiedRotationCut(type, rotation(500), rotation(430), inv(500, '2026-11-02'), inv(430, '2026-11-08')), true);
    assert.equal(reductionDecision(type, rotation(500), rotation(430)).allowed, false, 'default history guard remains strict');
  }
});
test('same or older inventory cut never justifies dropping rotation rows', () => {
  assert.equal(verifiedRotationCut('rotation_tech', rotation(500), rotation(430), inv(500, '2026-11-08'), inv(430, '2026-11-08')), false);
  assert.equal(verifiedRotationCut('rotation_tech', rotation(500), rotation(430), inv(500, '2026-11-08'), inv(430, '2026-11-07')), false);
});
test('missing, duplicate or nonmatching serials cannot justify rotation decrease', () => {
  assert.equal(verifiedRotationCut('rotation_tech', rotation(500), [...rotation(429), { serial: 'UNKNOWN' }], inv(500, '2026-11-02'), inv(430, '2026-11-08')), false);
  assert.equal(verifiedRotationCut('rotation_tech', rotation(500), [...rotation(429), rotation(1)[0]], inv(500, '2026-11-02'), inv(430, '2026-11-08')), false);
  assert.equal(verifiedRotationCut('rotation_tech', rotation(500), rotation(430), inv(500, '2026-11-02'), inv(430, '2026-11-02')), false);
});
test('a severe rotation loss and non-rotation tables remain protected', () => {
  assert.equal(verifiedRotationCut('rotation_tech', rotation(500), rotation(100), inv(500, '2026-11-02'), inv(100, '2026-11-08')), false);
  assert.equal(verifiedRotationCut('charges', rotation(500), rotation(430), inv(500, '2026-11-02'), inv(430, '2026-11-08')), false);
  assert.equal(reductionDecision('charges', rotation(500), rotation(475)).allowed, false);
});

test('sync preserves older charges and provenance when source shrinks by less than 10%', async () => {
  const historicalCharges = Array.from({ length: 130 }, (_, i) => ({ serial: 'B' + i, value: 1 }));
  const oldSource = { source_type: 'GOOGLE_SHEETS_API_READ_ONLY', source_tab: 'Cobros', original_data_rows: 130, retrieved_at: '2026-11-05T01:00:00.000Z', sanitized: true };
  const old = { tables: { charges: historicalCharges }, sources: { charges: oldSource } };
  let committed;
  const worker = new SheetsSync({ getDb: () => old, commit: async next => { committed = next; }, clock: () => new Date('2026-11-09T22:00:00Z') });
  worker.config.enabled = true;
  worker.save = async () => {};
  worker.metadata = async () => ({ sheets: SOURCE_TABS.map(s => ({ properties: { title: s.tab, gridProperties: { rowCount: 200 } } })) });
  worker.readTab = async source => ({
    rows: source.type === 'charges' ? historicalCharges.slice(0, 120) : [],
    last_actual_row: source.type === 'charges' ? 121 : 1,
  });
  const result = await worker.sync({ forceFull: true });
  assert.equal(result.ok, true);
  assert.equal(committed.tables.charges.length, 130, 'old charges remain unchanged');
  assert.equal(committed.sources.charges.retrieved_at, oldSource.retrieved_at, 'provenance is preserved');
  assert.equal(result.sources.charges.mode, 'HISTORICAL_REDUCTION_QUARANTINED');
});
