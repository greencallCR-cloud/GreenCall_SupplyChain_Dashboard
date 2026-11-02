-- Additive, private storage. Review and apply on a disposable development branch
-- first using a direct connection. This migration is NEVER run by HTTP handlers.
BEGIN;
CREATE SCHEMA IF NOT EXISTS greencall_private;
REVOKE ALL ON SCHEMA greencall_private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS greencall_private.snapshots (
  id uuid PRIMARY KEY,
  content_hash text NOT NULL UNIQUE CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object' AND manifest ? 'sources' AND manifest ? 'chunks' AND jsonb_typeof(manifest->'sources') = 'object' AND jsonb_typeof(manifest->'chunks') = 'array' AND octet_length(manifest::text) <= 2097152),
  row_counts jsonb NOT NULL CHECK (jsonb_typeof(row_counts) = 'object'),
  chunk_count integer NOT NULL CHECK (chunk_count BETWEEN 1 AND 4096),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1)
);
CREATE INDEX IF NOT EXISTS snapshots_captured_at_idx ON greencall_private.snapshots (captured_at DESC);

CREATE TABLE IF NOT EXISTS greencall_private.snapshot_chunks (
  snapshot_id uuid NOT NULL REFERENCES greencall_private.snapshots(id),
  source text NOT NULL CHECK (source ~ '^[a-z][a-z_]{0,63}$'),
  part integer NOT NULL CHECK (part >= 0),
  rows jsonb NOT NULL CHECK (jsonb_typeof(rows) = 'array' AND octet_length(rows::text) <= 2097152),
  row_count integer NOT NULL CHECK (row_count BETWEEN 1 AND 2500 AND row_count = jsonb_array_length(rows)),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 2 AND 1048576),
  PRIMARY KEY (snapshot_id, source, part)
);

CREATE TABLE IF NOT EXISTS greencall_private.active_snapshot (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
  snapshot_id uuid NOT NULL REFERENCES greencall_private.snapshots(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);

-- Protect historical payloads even against accidental UPDATE/DELETE by the app.
CREATE OR REPLACE FUNCTION greencall_private.reject_snapshot_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Private snapshots are append-only' USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS snapshot_append_only ON greencall_private.snapshots;
CREATE TRIGGER snapshot_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON greencall_private.snapshots
FOR EACH STATEMENT EXECUTE FUNCTION greencall_private.reject_snapshot_mutation();
DROP TRIGGER IF EXISTS snapshot_chunk_append_only ON greencall_private.snapshot_chunks;
CREATE TRIGGER snapshot_chunk_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON greencall_private.snapshot_chunks
FOR EACH STATEMENT EXECUTE FUNCTION greencall_private.reject_snapshot_mutation();

REVOKE ALL ON ALL TABLES IN SCHEMA greencall_private FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA greencall_private FROM PUBLIC;
-- Runtime role: USAGE(schema), SELECT only. Isolated ingestion role additionally
-- needs INSERT(snapshots, snapshot_chunks), INSERT/UPDATE(active_snapshot). Never grant PUBLIC.
-- Rollback data activation by pointing active_snapshot at a prior verified id;
-- retain all historical rows. Do not drop or rewrite snapshots for rollback.
COMMIT;
