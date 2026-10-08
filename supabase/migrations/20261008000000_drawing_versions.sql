-- Drawings uploaded as new versions on the Parts & Drawings page (files from enquiries, sales orders and inwards are
-- read straight from those records; this table holds only what is uploaded here).
begin;

create table if not exists public.cnc_drawing_versions (
  id           uuid primary key default gen_random_uuid(),
  party_name   text not null default '',
  product_name text not null,
  file_path    text not null,
  file_name    text not null,
  file_size    bigint,
  notes        text,
  uploaded_by  text,
  created_at   timestamptz not null default now()
);

select public.erp_secure_table('cnc_drawing_versions');

create unique index if not exists cnc_drawing_versions_path_key on public.cnc_drawing_versions (company_id, file_path);
create index if not exists cnc_drawing_versions_product_idx on public.cnc_drawing_versions (company_id, party_name, product_name, created_at);

notify pgrst, 'reload schema';
commit;
