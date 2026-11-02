-- Additive derived cache: computed dashboards per (snapshot, engine version, filter).
-- Not a source of truth: every row is reproducible from its immutable snapshot and can be
-- pruned by the owner. Requires 20261031_001_snapshots.sql. Never run by HTTP handlers.
BEGIN;
CREATE TABLE IF NOT EXISTS greencall_private.snapshot_views (
  snapshot_id uuid NOT NULL REFERENCES greencall_private.snapshots(id),
  engine text NOT NULL CHECK (engine ~ '^[A-Za-z0-9._-]{1,80}$'),
  view_key text NOT NULL CHECK (char_length(view_key) BETWEEN 2 AND 600),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 8388608),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_id, engine, view_key)
);
REVOKE ALL ON greencall_private.snapshot_views FROM PUBLIC;
-- Runtime read role: SELECT and INSERT on this table only (no UPDATE/DELETE). Readers verify
-- payload_hash and ignore mismatching rows. Prune old snapshots' views as the owner if needed.
COMMIT;
