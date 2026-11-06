-- Digital Store: how a product is shown when someone turns it in 3D.
--   box    - a packed product: a box with the picture on it (default)
--   round  - a turned / round product (probe, bush, shaft...): a 3D body is built from the one photo
--   model  - a real 3D model file (.glb) uploaded for the product
--   spin   - several photos taken around the product (a 360 degree turntable)
-- Safe to run more than once.

alter table public.digital_store_items add column if not exists shape text not null default 'box';
alter table public.digital_store_items add column if not exists model_path text;
alter table public.digital_store_items add column if not exists angle_paths text[] not null default '{}';

do $$
begin
  alter table public.digital_store_items drop constraint if exists digital_store_items_shape_check;
  alter table public.digital_store_items add constraint digital_store_items_shape_check check (shape in ('box', 'round', 'model', 'spin'));
end $$;
