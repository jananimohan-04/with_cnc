-- Inward entries get a "Party DC No.": the delivery challan number of the company that sent the material.
-- It is shown on the inward and printed on the sales invoice made for that order. Safe to run more than once.
alter table public.cnc_inwards add column if not exists party_dc_no text;
