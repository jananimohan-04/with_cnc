-- Digital Store: how a product is shown when someone turns it in 3D.
--   round  - the real shape of the product, built from its photo (default: the product itself turns)
--   box    - a packed product: a box with the picture on it
--   model  - a real 3D model file (.glb) uploaded for the product
--   spin   - several photos taken around the product (a 360 degree turntable)
-- Safe to run more than once.

alter table public.digital_store_items add column if not exists shape text not null default 'round';
alter table public.digital_store_items add column if not exists model_path text;
alter table public.digital_store_items add column if not exists angle_paths text[] not null default '{}';

-- the default is now the real product shape (a first version of this file used 'box')
alter table public.digital_store_items alter column shape set default 'round';

-- products added before the choice existed were all set to the old default: show the real product, not a box
update public.digital_store_items
set shape = 'round'
where shape = 'box' and model_path is null and coalesce(array_length(angle_paths, 1), 0) = 0;

do $$
begin
  alter table public.digital_store_items drop constraint if exists digital_store_items_shape_check;
  alter table public.digital_store_items add constraint digital_store_items_shape_check check (shape in ('box', 'round', 'model', 'spin'));
end $$;
