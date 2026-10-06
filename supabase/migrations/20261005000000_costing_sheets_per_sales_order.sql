-- Costing without a quotation: sheets are versioned per sales order instead.
-- The old unique index (company, quotation_no, product_code, version) made every direct
-- order (quotation_no = '') share one version chain, so a second order failed with
-- "duplicate key value violates unique constraint cnc_costing_sheets_ver_key".
begin;

update public.cnc_costing_sheets set sales_order_no = '' where sales_order_no is null;

drop index if exists public.cnc_costing_sheets_ver_key;
create unique index if not exists cnc_costing_sheets_ver_key
  on public.cnc_costing_sheets (company_id, quotation_no, coalesce(sales_order_no, ''), product_code, version);

notify pgrst, 'reload schema';
commit;
