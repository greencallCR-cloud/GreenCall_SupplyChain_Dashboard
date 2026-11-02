/** SQL access to the append-only physical-count ledger. Server-only module. */
const rowsOf = result => Array.isArray(result) ? result : result?.rows || [];
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const META = `b.id, b.seq, b.action, b.file_sha256, b.filename, b.reverts_batch, b.base_snapshot_id, b.result_snapshot_id, b.row_count, b.stats, b.actor, b.created_at,
  (SELECT r.id FROM greencall_private.physical_import_batches r WHERE r.reverts_batch = b.id AND r.action = 'REVERT') AS reverted_by`;
const meta = row => ({
  id: row.id, seq: Number(row.seq), action: row.action, file_sha256: row.file_sha256 || null, filename: row.filename || null,
  reverts_batch: row.reverts_batch || null, base_snapshot_id: row.base_snapshot_id || null, result_snapshot_id: row.result_snapshot_id,
  row_count: row.row_count, stats: parse(row.stats), actor: row.actor, created_at: new Date(row.created_at).toISOString(), reverted_by: row.reverted_by || null,
});

export function createPhysicalLedger({ query }) {
  if (typeof query !== 'function') throw new TypeError('Se necesita un adaptador SQL privado.');
  return {
    async getBatch(id) {
      const row = rowsOf(await query(`SELECT ${META} FROM greencall_private.physical_import_batches b WHERE b.id = $1::uuid`, [id]))[0];
      return row ? meta(row) : null;
    },
    async listBatches({ limit = 100 } = {}) {
      return rowsOf(await query(`SELECT ${META} FROM greencall_private.physical_import_batches b ORDER BY b.seq DESC LIMIT $1`, [Math.min(200, Math.max(1, limit))])).map(meta);
    },
    async activeImportBatches() {
      return rowsOf(await query(`SELECT b.id, b.rows FROM greencall_private.physical_import_batches b
        WHERE b.action = 'IMPORT' AND NOT EXISTS (SELECT 1 FROM greencall_private.physical_import_batches r WHERE r.reverts_batch = b.id AND r.action = 'REVERT')
        ORDER BY b.seq`, [])).map(row => ({ id: row.id, rows: parse(row.rows) }));
    },
    /** Statement for the activation transaction: inserted only if the result snapshot is now active. */
    recordStatement(batch, { baseSnapshotId, resultSnapshotId, actor }) {
      return {
        text: `INSERT INTO greencall_private.physical_import_batches (id, action, file_sha256, filename, reverts_batch, base_snapshot_id, result_snapshot_id, rows, row_count, stats, actor)
          SELECT $1::uuid, $2, $3, $4, $5::uuid, $6::uuid, $7::uuid, $8::jsonb, $9, $10::jsonb, $11
          WHERE EXISTS (SELECT 1 FROM greencall_private.active_snapshot a WHERE a.singleton = true AND a.snapshot_id = $7::uuid)
          ON CONFLICT DO NOTHING RETURNING id`,
        values: [batch.id, batch.action, batch.file_sha256 || null, batch.filename || null, batch.reverts_batch || null, baseSnapshotId || null, resultSnapshotId,
          JSON.stringify(batch.rows), batch.rows.length, JSON.stringify(batch.stats || {}), actor],
      };
    },
  };
}
