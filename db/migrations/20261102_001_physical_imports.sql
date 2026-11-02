-- Additive, private ledger of Cloud physical-count imports and reversals.
-- Requires 20261031_001_snapshots.sql. Review and apply on a disposable Neon
-- development branch first using a direct connection. Never run by HTTP handlers.
BEGIN;
CREATE TABLE IF NOT EXISTS greencall_private.physical_import_batches (
  id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  action text NOT NULL CHECK (action IN ('IMPORT', 'REVERT')),
  file_sha256 text CHECK (file_sha256 IS NULL OR file_sha256 ~ '^[0-9a-f]{64}$'),
  filename text CHECK (filename IS NULL OR char_length(filename) BETWEEN 1 AND 120),
  reverts_batch uuid REFERENCES greencall_private.physical_import_batches(id),
  base_snapshot_id uuid REFERENCES greencall_private.snapshots(id),
  result_snapshot_id uuid NOT NULL REFERENCES greencall_private.snapshots(id),
  rows jsonb NOT NULL CHECK (jsonb_typeof(rows) = 'array' AND octet_length(rows::text) <= 16777216),
  row_count integer NOT NULL CHECK (row_count BETWEEN 0 AND 20000 AND row_count = jsonb_array_length(rows)),
  stats jsonb NOT NULL CHECK (jsonb_typeof(stats) = 'object' AND octet_length(stats::text) <= 65536),
  actor text NOT NULL CHECK (actor ~ '^[a-z_]{1,32}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT physical_batch_shape CHECK (
    (action = 'IMPORT' AND file_sha256 IS NOT NULL AND filename IS NOT NULL AND reverts_batch IS NULL AND row_count >= 1)
    OR (action = 'REVERT' AND reverts_batch IS NOT NULL AND file_sha256 IS NULL AND row_count = 0))
);
-- A batch can be reverted at most once; re-import a corrected file instead of "un-reverting".
CREATE UNIQUE INDEX IF NOT EXISTS physical_import_one_revert ON greencall_private.physical_import_batches (reverts_batch) WHERE action = 'REVERT';
CREATE INDEX IF NOT EXISTS physical_import_batches_file_idx ON greencall_private.physical_import_batches (file_sha256) WHERE action = 'IMPORT';

DROP TRIGGER IF EXISTS physical_import_append_only ON greencall_private.physical_import_batches;
CREATE TRIGGER physical_import_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON greencall_private.physical_import_batches
FOR EACH STATEMENT EXECUTE FUNCTION greencall_private.reject_snapshot_mutation();

REVOKE ALL ON greencall_private.physical_import_batches FROM PUBLIC;
-- Runtime read role: SELECT only. Physical writer role (GREENCALL_PHYSICAL_DATABASE_URL):
-- SELECT on all greencall_private tables, INSERT(snapshots, snapshot_chunks,
-- physical_import_batches), INSERT/UPDATE(active_snapshot). Never grant PUBLIC.
-- Rollback of a batch = new REVERT row + reactivation; rows are never deleted.
COMMIT;
