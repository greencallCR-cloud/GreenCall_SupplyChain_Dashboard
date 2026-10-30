-- MIGRACIÓN INCREMENTAL NO EJECUTADA. Revisar antes de cualquier despliegue.
-- Namespace sc_ evita colisión con el dashboard ODT existente.
CREATE TABLE IF NOT EXISTS public.sc_import_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_type text NOT NULL,
 source_hash text NOT NULL,
 source_name text,
 submitted_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'preview',
 statistics jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS sc_import_batches_source_idx ON public.sc_import_batches (source_type,source_hash);
CREATE TABLE IF NOT EXISTS public.sc_source_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_id uuid REFERENCES public.sc_import_batches(id),
 sha256 text NOT NULL,
 filename text,
 header_signature text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sc_sku_catalog (sku text NOT NULL,center text NOT NULL DEFAULT '',warehouse text NOT NULL DEFAULT '',lot text NOT NULL DEFAULT '',description text,cost_crc numeric(18,4),unit text,attrs jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(sku,center,warehouse,lot));
CREATE TABLE IF NOT EXISTS public.sc_technicians (tech_code text PRIMARY KEY,display_name text,employment_type text,active boolean,attrs jsonb DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS public.sc_sku_aliases (alias text PRIMARY KEY,official_sku text NOT NULL,validated_at timestamptz,source text);
CREATE TABLE IF NOT EXISTS public.sc_suppliers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),supplier_name text NOT NULL,sku text NOT NULL,lead_time_days integer,moq numeric,pack_size numeric,active boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS public.sc_planning_settings (key text PRIMARY KEY,value jsonb NOT NULL,updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.sc_consumption_events (event_key text PRIMARY KEY,record jsonb NOT NULL,order_id text,sku text,tech_code text,event_date date,source_mode text,created_at timestamptz DEFAULT now());
CREATE INDEX IF NOT EXISTS sc_consumptions_sku_date ON public.sc_consumption_events(sku,event_date);
CREATE TABLE IF NOT EXISTS public.sc_dispatch_events (event_key text PRIMARY KEY,record jsonb NOT NULL,sku text,serial_no text,tech_code text,event_date date,created_at timestamptz DEFAULT now());
CREATE INDEX IF NOT EXISTS sc_dispatch_serial_date ON public.sc_dispatch_events(serial_no,event_date);
CREATE TABLE IF NOT EXISTS public.sc_inventory_snapshots (snapshot_key text PRIMARY KEY,record jsonb NOT NULL,sku text,serial_no text,cut_date date,source_mode text,batch_id uuid REFERENCES public.sc_import_batches(id));
CREATE INDEX IF NOT EXISTS sc_inv_cut_sku ON public.sc_inventory_snapshots(cut_date,sku);
CREATE TABLE IF NOT EXISTS public.sc_physical_counts (count_key text PRIMARY KEY,record jsonb NOT NULL,sku text,tech_code text,cut_date date,batch_id uuid REFERENCES public.sc_import_batches(id));
CREATE INDEX IF NOT EXISTS sc_phys_tech_sku ON public.sc_physical_counts(tech_code,sku,cut_date);
CREATE TABLE IF NOT EXISTS public.sc_charges (charge_key text PRIMARY KEY,record jsonb NOT NULL,serial_no text,charge_date date);
CREATE TABLE IF NOT EXISTS public.sc_workshop_returns (return_key text PRIMARY KEY,record jsonb NOT NULL,serial_no text,return_date date);
CREATE TABLE IF NOT EXISTS public.sc_receipts (receipt_key text PRIMARY KEY,record jsonb NOT NULL,sku text,receipt_date date);
CREATE TABLE IF NOT EXISTS public.sc_forecasts (forecast_key text PRIMARY KEY,sku text,as_of date,model text,metrics jsonb,projections jsonb);
-- Private-by-default. No public/anon policies are granted here.
ALTER TABLE public.sc_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sc_source_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sc_sku_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sc_technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sc_sku_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sc_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sc_planning_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sc_consumption_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sc_dispatch_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sc_inventory_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sc_physical_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sc_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sc_workshop_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sc_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sc_forecasts ENABLE ROW LEVEL SECURITY;
