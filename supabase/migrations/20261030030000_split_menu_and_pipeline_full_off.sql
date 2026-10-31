-- Menu entries and pipeline columns used to share one switch (quotations, sales-orders, finished-goods, delivery, invoices).
-- They are now separate. A module that was fully off stays off for the MENU (menu-* key) and is given back to the PIPELINE column.
begin;

-- Switches a Super Admin pressed before "Full off" became company-independent now apply to every company.
update public.cnc_disabled_modules d set is_global = true
where exists (select 1 from public.company_users u where u.role = 'SUPER_ADMIN' and u.full_name = d.disabled_by);

insert into public.cnc_disabled_modules (company_id, module_key, disabled_by, is_global)
select d.company_id, 'menu-' || d.module_key, d.disabled_by, d.is_global
from public.cnc_disabled_modules d
where d.module_key in ('quotations', 'sales-orders', 'finished-goods', 'delivery', 'invoices')
on conflict (company_id, module_key) do nothing;

delete from public.cnc_disabled_modules
where module_key in ('quotations', 'sales-orders', 'finished-goods', 'delivery', 'invoices');

commit;

select module_key, count(*) from public.cnc_disabled_modules group by module_key order by module_key;
