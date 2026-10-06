-- Delivery Challan header/line fields the pipeline saves (address, GSTIN, e-way bill, vehicle,
-- signatures ...). Databases created before these existed silently dropped them, so a filled-in
-- challan came back empty after "Done Editing".
begin;

alter table public.cnc_deliveries
  add column if not exists vehicle_no          text,
  add column if not exists billing_address     text,
  add column if not exists customer_gstin      text,
  add column if not exists customer_code       text,
  add column if not exists eway_bill           text,
  add column if not exists po_no               text,
  add column if not exists place_of_supply     text,
  add column if not exists packaging_details   text,
  add column if not exists enquiry_no          text,
  add column if not exists phone               text,
  add column if not exists category            text,
  add column if not exists process             text,
  add column if not exists hsn                 text,
  add column if not exists unit                text,
  add column if not exists unit_price          numeric(18, 2),
  add column if not exists total_amount        numeric(18, 2),
  add column if not exists receiver_name       text,
  add column if not exists sender_name         text,
  add column if not exists customer_signature  text,
  add column if not exists authorized_signature text;

notify pgrst, 'reload schema';
commit;
