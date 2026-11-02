/** Preview / apply / revert / history for Cloud physical counts. Server-only.
 * Authorization (admin session + same origin) happens in the HTTP layer before this.
 */
import { PhysicalImportError, parsePhysicalFile, physicalBatchId, planPhysicalImport, planPhysicalRevert } from './physical-import.mjs';

const fail = (code, message, status) => new PhysicalImportError(code, message, status);
// Costa Rica has no DST: UTC-6 all year. A count dated "tomorrow" there is a typing error.
const costaRicaDate = date => new Date(date.getTime() - 6 * 3600 * 1000).toISOString().slice(0, 10);
const validId = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

export function createPhysicalService({ repository, ledger, clock = () => new Date(), actor = 'admin_key' }) {
  async function active() {
    const snapshot = await repository.loadSnapshot();
    if (!snapshot) throw fail('SNAPSHOT_REQUIRED', 'No hay un snapshot privado activo; sincronice primero las fuentes de Google Sheets.', 409);
    return snapshot;
  }
  async function publish(snapshot, next, batch) {
    try {
      const result = await repository.publishSnapshot(next, {
        capturedAt: snapshot.captured_at, // Sheets capture time stays the Sheets capture time.
        expectedSnapshotId: snapshot.id,
        afterActivation: id => [ledger.recordStatement(batch, { baseSnapshotId: snapshot.id, resultSnapshotId: id, actor })],
      });
      const recorded = result.extra?.[0];
      if (!(Array.isArray(recorded) ? recorded : recorded?.rows || []).length && !(await ledger.getBatch(batch.id))) throw fail('LEDGER_WRITE_FAILED', 'La bitácora no confirmó el lote; revise el estado antes de reintentar.', 500);
      return result.id;
    } catch (error) {
      if (error.code === 'SNAPSHOT_CONFLICT') throw fail('SNAPSHOT_CONFLICT', 'Los datos cambiaron desde la vista previa; vuelva a analizar el archivo.', 409);
      throw error;
    }
  }
  function plan(snapshot, parsed, batches) {
    const now = clock();
    return planPhysicalImport({ data: snapshot.data, parsed, batches, batchId: physicalBatchId('IMPORT', parsed.sha256, snapshot.id), today: costaRicaDate(now), now: now.toISOString() });
  }
  return {
    async preview({ buffer, filename }) {
      const parsed = parsePhysicalFile(buffer, filename);
      const snapshot = await active();
      const { preview } = plan(snapshot, parsed, await ledger.activeImportBatches());
      return { ...preview, base_snapshot: { id: snapshot.id, captured_at: snapshot.captured_at } };
    },
    async apply({ buffer, filename, expectedSha, baseSnapshotId }) {
      if (!/^[a-f0-9]{64}$/.test(String(expectedSha || '')) || !validId(baseSnapshotId)) throw fail('PREVIEW_REQUIRED', 'Analice el archivo (vista previa) antes de aplicarlo.', 400);
      const parsed = parsePhysicalFile(buffer, filename);
      if (parsed.sha256 !== expectedSha) throw fail('FILE_CHANGED', 'El archivo no coincide con la vista previa; vuelva a analizarlo.', 409);
      const batchId = physicalBatchId('IMPORT', parsed.sha256, baseSnapshotId);
      const existing = await ledger.getBatch(batchId);
      if (existing) return { ok: true, idempotent: true, batch_id: batchId, snapshot_id: existing.result_snapshot_id, stats: existing.stats };
      const snapshot = await active();
      if (snapshot.id !== baseSnapshotId) throw fail('SNAPSHOT_CONFLICT', 'Los datos cambiaron desde la vista previa; vuelva a analizar el archivo.', 409);
      const { preview, next, batch } = plan(snapshot, parsed, await ledger.activeImportBatches());
      if (!next) throw Object.assign(fail('VALIDATION_FAILED', preview.blocked_reason === 'NO_CHANGES' ? 'El archivo no contiene conteos nuevos ni correcciones.' : 'El archivo tiene errores bloqueantes; corríjalos y vuelva a analizarlo.', 422), { preview });
      const snapshotId = await publish(snapshot, next, batch);
      return { ok: true, idempotent: false, batch_id: batch.id, snapshot_id: snapshotId, stats: preview.stats };
    },
    async revert({ batchId, baseSnapshotId }) {
      if (!validId(batchId) || !validId(baseSnapshotId)) throw fail('INVALID_REQUEST', 'Solicitud de reversión inválida.', 400);
      const target = await ledger.getBatch(batchId);
      if (!target || target.action !== 'IMPORT' || target.reverted_by) throw fail('BATCH_NOT_ACTIVE', 'El lote no existe, no es una importación o ya fue revertido.', 409);
      const snapshot = await active();
      if (snapshot.id !== baseSnapshotId) throw fail('SNAPSHOT_CONFLICT', 'Los datos cambiaron; actualice el historial antes de revertir.', 409);
      const { next, batch } = planPhysicalRevert({ data: snapshot.data, batches: await ledger.activeImportBatches(), batchId, revertId: physicalBatchId('REVERT', batchId), now: clock().toISOString() });
      const snapshotId = await publish(snapshot, next, batch);
      return { ok: true, batch_id: batch.id, reverted: batchId, snapshot_id: snapshotId, stats: batch.stats };
    },
    async history({ limit = 100 } = {}) {
      const snapshot = await repository.loadSnapshot();
      return { batches: await ledger.listBatches({ limit }), active_snapshot: snapshot ? { id: snapshot.id, captured_at: snapshot.captured_at } : null };
    },
  };
}
