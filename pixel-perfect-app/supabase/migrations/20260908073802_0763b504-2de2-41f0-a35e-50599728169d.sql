-- ============ enums ============
create type public.doc_status as enum ('Draft','Under Review','Approved','Released','Superseded','Archived');
create type public.entity_status as enum ('Active','Inactive','Suspended');

-- ============ helpers ============
create or replace function public.update_updated_at_column()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

-- ============ roles ============
create table public.cncvault_roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  is_system boolean not null default false,
  permissions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.cncvault_roles to authenticated;
grant all on public.cncvault_roles to service_role;
alter table public.cncvault_roles enable row level security;

insert into public.cncvault_roles (key, name, description, is_system, permissions) values
('super_admin','Super Admin','Full control over documents, users, roles and settings.',true,
  array['view','download','upload','edit','delete','approve','manage_access','manage_users','manage_roles','manage_parties','manage_documents','view_audit','manage_settings']),
('admin','Admin','Full document and user management.',true,
  array['view','download','upload','edit','delete','approve','manage_access','manage_users','manage_parties','manage_documents','view_audit']),
('engineering','Engineering','Upload drawings, create revisions and edit metadata.',true,
  array['view','download','upload','edit','manage_parties','manage_documents']),
('production','Production','View and download approved or released documents.',true,
  array['view','download']),
('quality','Quality','Review and approve engineering documents.',true,
  array['view','download','approve']),
('viewer','Viewer','View documents only.',true, array['view']);

-- ============ profiles ============
create table public.cncvault_profiles (
  user_id uuid primary key,
  full_name text not null default '',
  email text not null default '',
  department text,
  status public.entity_status not null default 'Active',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.cncvault_profiles to authenticated;
grant all on public.cncvault_profiles to service_role;
alter table public.cncvault_profiles enable row level security;

create table public.cncvault_user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role_id uuid not null references public.cncvault_roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, role_id)
);
grant select, insert, update, delete on public.cncvault_user_roles to authenticated;
grant all on public.cncvault_user_roles to service_role;
alter table public.cncvault_user_roles enable row level security;

create or replace function public.has_permission(_user_id uuid, _permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.cncvault_user_roles ur
    join public.cncvault_roles r on r.id = ur.role_id
    where ur.user_id = _user_id and _permission = any(r.permissions)
  )
$$;

create or replace function public.is_doc_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.cncvault_user_roles ur
    join public.cncvault_roles r on r.id = ur.role_id
    where ur.user_id = _user_id and r.key in ('super_admin','admin')
  )
$$;

-- new users: profile + role
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare _role_id uuid; _first boolean;
begin
  insert into public.cncvault_profiles (user_id, full_name, email, department)
  values (new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    coalesce(new.email,''),
    new.raw_user_meta_data->>'department');

  select count(*) = 1 into _first from public.cncvault_profiles;
  select id into _role_id from public.cncvault_roles where key = case when _first then 'super_admin' else 'viewer' end;
  insert into public.cncvault_user_roles (user_id, role_id) values (new.id, _role_id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users for each row execute function public.handle_new_user();

-- ============ parties ============
create table public.cncvault_parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  contact_person text,
  email text,
  phone text,
  address text,
  status public.entity_status not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.cncvault_parties to authenticated;
grant all on public.cncvault_parties to service_role;
alter table public.cncvault_parties enable row level security;

-- ============ parts ============
create table public.cncvault_parts (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.cncvault_parties(id) on delete cascade,
  part_number text not null,
  part_name text not null,
  drawing_number text,
  drawing_type text,
  current_revision integer not null default 0,
  status public.doc_status not null default 'Draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (party_id, part_number)
);
grant select, insert, update, delete on public.cncvault_parts to authenticated;
grant all on public.cncvault_parts to service_role;
alter table public.cncvault_parts enable row level security;

-- ============ documents ============
create table public.cncvault_documents (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.cncvault_parties(id) on delete cascade,
  part_id uuid references public.cncvault_parts(id) on delete set null,
  document_number text not null unique,
  document_name text not null,
  drawing_number text,
  part_number text,
  document_type text not null default 'Mechanical Drawing',
  category text,
  description text,
  current_version integer not null default 0,
  status public.doc_status not null default 'Draft',
  file_type text,
  created_by uuid,
  created_by_name text,
  updated_by uuid,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.cncvault_documents to authenticated;
grant all on public.cncvault_documents to service_role;
alter table public.cncvault_documents enable row level security;
create index documents_party_idx on public.cncvault_documents(party_id);
create index documents_search_idx on public.cncvault_documents(document_number, part_number, document_name);

create table public.cncvault_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.cncvault_documents(id) on delete cascade,
  version_number integer not null,
  file_name text not null,
  file_type text,
  file_size bigint,
  drive_file_id text,
  drive_folder_id text,
  drive_url text,
  revision_notes text,
  status public.doc_status not null default 'Draft',
  uploaded_by uuid,
  uploaded_by_name text,
  uploaded_at timestamptz not null default now(),
  unique (document_id, version_number)
);
grant select, insert, update on public.cncvault_document_versions to authenticated;
grant all on public.cncvault_document_versions to service_role;
alter table public.cncvault_document_versions enable row level security;

create table public.cncvault_document_permissions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.cncvault_documents(id) on delete cascade,
  user_id uuid,
  role_id uuid references public.cncvault_roles(id) on delete cascade,
  department text,
  permissions text[] not null default array['view'],
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.cncvault_document_permissions to authenticated;
grant all on public.cncvault_document_permissions to service_role;
alter table public.cncvault_document_permissions enable row level security;
create index document_permissions_doc_idx on public.cncvault_document_permissions(document_id);

create or replace function public.can_access_document(_user_id uuid, _document_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    public.is_doc_admin(_user_id)
    or not exists (select 1 from public.cncvault_document_permissions dp where dp.document_id = _document_id)
    or exists (
      select 1 from public.cncvault_document_permissions dp
      where dp.document_id = _document_id
        and (
          dp.user_id = _user_id
          or dp.role_id in (select role_id from public.cncvault_user_roles where user_id = _user_id)
          or dp.department = (select department from public.cncvault_profiles where user_id = _user_id)
        )
    )
$$;

-- ============ audit + notifications ============
create table public.cncvault_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  user_name text,
  action text not null,
  document_id uuid references public.cncvault_documents(id) on delete set null,
  document_number text,
  version_number integer,
  party_name text,
  details text,
  ip_address text,
  created_at timestamptz not null default now()
);
grant select, insert on public.cncvault_audit_logs to authenticated;
grant all on public.cncvault_audit_logs to service_role;
alter table public.cncvault_audit_logs enable row level security;
create index audit_logs_created_idx on public.cncvault_audit_logs(created_at desc);

create table public.cncvault_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  title text not null,
  body text,
  type text not null default 'info',
  document_id uuid references public.cncvault_documents(id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.cncvault_notifications to authenticated;
grant all on public.cncvault_notifications to service_role;
alter table public.cncvault_notifications enable row level security;

-- ============ policies ============
create policy "roles readable" on public.cncvault_roles for select to authenticated using (true);
create policy "roles managed" on public.cncvault_roles for all to authenticated
  using (public.has_permission(auth.uid(),'manage_roles')) with check (public.has_permission(auth.uid(),'manage_roles'));

create policy "profiles readable" on public.cncvault_profiles for select to authenticated using (true);
create policy "profiles self update" on public.cncvault_profiles for update to authenticated
  using (user_id = auth.uid() or public.has_permission(auth.uid(),'manage_users'))
  with check (user_id = auth.uid() or public.has_permission(auth.uid(),'manage_users'));
create policy "profiles admin insert" on public.cncvault_profiles for insert to authenticated
  with check (public.has_permission(auth.uid(),'manage_users'));

create policy "user_roles readable" on public.cncvault_user_roles for select to authenticated using (true);
create policy "user_roles managed" on public.cncvault_user_roles for all to authenticated
  using (public.has_permission(auth.uid(),'manage_users')) with check (public.has_permission(auth.uid(),'manage_users'));

create policy "parties readable" on public.cncvault_parties for select to authenticated using (public.has_permission(auth.uid(),'view'));
create policy "parties managed" on public.cncvault_parties for all to authenticated
  using (public.has_permission(auth.uid(),'manage_parties')) with check (public.has_permission(auth.uid(),'manage_parties'));

create policy "parts readable" on public.cncvault_parts for select to authenticated using (public.has_permission(auth.uid(),'view'));
create policy "parts managed" on public.cncvault_parts for all to authenticated
  using (public.has_permission(auth.uid(),'manage_documents') or public.has_permission(auth.uid(),'upload'))
  with check (public.has_permission(auth.uid(),'manage_documents') or public.has_permission(auth.uid(),'upload'));

create policy "documents readable" on public.cncvault_documents for select to authenticated
  using (public.has_permission(auth.uid(),'view') and public.can_access_document(auth.uid(), id));
create policy "documents insert" on public.cncvault_documents for insert to authenticated
  with check (public.has_permission(auth.uid(),'upload'));
create policy "documents update" on public.cncvault_documents for update to authenticated
  using (public.has_permission(auth.uid(),'edit') or public.has_permission(auth.uid(),'approve'))
  with check (public.has_permission(auth.uid(),'edit') or public.has_permission(auth.uid(),'approve'));
create policy "documents delete" on public.cncvault_documents for delete to authenticated
  using (public.has_permission(auth.uid(),'delete'));

create policy "versions readable" on public.cncvault_document_versions for select to authenticated
  using (public.has_permission(auth.uid(),'view') and public.can_access_document(auth.uid(), document_id));
create policy "versions insert" on public.cncvault_document_versions for insert to authenticated
  with check (public.has_permission(auth.uid(),'upload'));
create policy "versions update" on public.cncvault_document_versions for update to authenticated
  using (public.has_permission(auth.uid(),'approve') or public.has_permission(auth.uid(),'edit'))
  with check (public.has_permission(auth.uid(),'approve') or public.has_permission(auth.uid(),'edit'));

create policy "doc perms readable" on public.cncvault_document_permissions for select to authenticated
  using (public.has_permission(auth.uid(),'view'));
create policy "doc perms managed" on public.cncvault_document_permissions for all to authenticated
  using (public.has_permission(auth.uid(),'manage_access')) with check (public.has_permission(auth.uid(),'manage_access'));

create policy "audit readable" on public.cncvault_audit_logs for select to authenticated
  using (public.has_permission(auth.uid(),'view_audit'));
create policy "audit insert" on public.cncvault_audit_logs for insert to authenticated with check (true);

create policy "notifications readable" on public.cncvault_notifications for select to authenticated
  using (user_id is null or user_id = auth.uid());
create policy "notifications update own" on public.cncvault_notifications for update to authenticated
  using (user_id is null or user_id = auth.uid()) with check (user_id is null or user_id = auth.uid());
create policy "notifications insert" on public.cncvault_notifications for insert to authenticated with check (true);

-- ============ updated_at triggers ============
create trigger t_roles_updated before update on public.cncvault_roles for each row execute function public.update_updated_at_column();
create trigger t_profiles_updated before update on public.cncvault_profiles for each row execute function public.update_updated_at_column();
create trigger t_parties_updated before update on public.cncvault_parties for each row execute function public.update_updated_at_column();
create trigger t_parts_updated before update on public.cncvault_parts for each row execute function public.update_updated_at_column();
create trigger t_documents_updated before update on public.cncvault_documents for each row execute function public.update_updated_at_column();

-- ============ sample data ============
insert into public.cncvault_parties (name, code, contact_person, email, phone, address, status) values
('ABC Engineering','ABC','R. Sundaram','contact@abceng.com','+91 98400 11223','12 Industrial Estate, Coimbatore','Active'),
('XYZ Industries','XYZ','M. Kulkarni','purchase@xyzind.com','+91 98220 44556','Plot 7, MIDC Pune','Active'),
('PQR Manufacturing','PQR','S. Iyer','engineering@pqrmfg.com','+91 90030 77889','45 GIDC Vatva, Ahmedabad','Active'),
('KSS Engineering','KSS','A. Bhat','info@ksseng.com','+91 99860 33445','9 Peenya Industrial Area, Bengaluru','Active'),
('Precision Components','PCL','D. Menon','quality@precisioncomp.com','+91 99400 55667','22 Ambattur Industrial Estate, Chennai','Inactive');

insert into public.cncvault_parts (party_id, part_number, part_name, drawing_number, drawing_type, current_revision, status)
select p.id, v.pn, v.nm, v.dn, v.dt, v.rev, v.st::public.doc_status from public.cncvault_parties p
join (values
 ('ABC','CNC-2456','Bracket Assembly','DRG-2456','Assembly Drawing',4,'Approved'),
 ('ABC','CNC-2457','Mounting Plate','DRG-2457','Mechanical Drawing',2,'Released'),
 ('XYZ','CNC-3102','Spindle Housing','DRG-3102','Fabrication Drawing',3,'Under Review'),
 ('XYZ','CNC-3103','Bearing Cap','DRG-3103','Mechanical Drawing',1,'Draft'),
 ('PQR','CNC-4210','Gear Blank','DRG-4210','Inspection Drawing',5,'Released'),
 ('PQR','CNC-4211','Shaft Coupling','DRG-4211','Mechanical Drawing',2,'Approved'),
 ('KSS','CNC-5021','Hydraulic Manifold','DRG-5021','Assembly Drawing',3,'Approved'),
 ('PCL','CNC-6014','Precision Bushing','DRG-6014','Mechanical Drawing',1,'Archived')
) as v(code,pn,nm,dn,dt,rev,st) on v.code = p.code;

insert into public.cncvault_documents (party_id, part_id, document_number, document_name, drawing_number, part_number, document_type, category, description, current_version, status, file_type, created_by_name, updated_by_name, created_at, updated_at)
select pt.party_id, pt.id,
  pa.code || '-' || pt.part_number, v.doc_name, pt.drawing_number, pt.part_number, v.doc_type, v.cat,
  v.descr, v.ver, v.st::public.doc_status, v.ft, v.creator, v.updater,
  now() - (v.age || ' days')::interval, now() - (v.upd || ' hours')::interval
from public.cncvault_parts pt
join public.cncvault_parties pa on pa.id = pt.party_id
join (values
 ('CNC-2456','Bracket Assembly','Assembly Drawing','Production','Welded bracket assembly for column mount.',4,'Approved','PDF','Arun','Arun',40,2),
 ('CNC-2457','Mounting Plate','Mechanical Drawing','Production','Base mounting plate, 12mm MS.',2,'Released','DWG','Priya','Kumar',32,26),
 ('CNC-3102','Spindle Housing','Fabrication Drawing','Machining','Spindle housing weldment with bore tolerances.',3,'Under Review','PDF','Kumar','Kumar',28,5),
 ('CNC-3103','Bearing Cap','Mechanical Drawing','Machining','Bearing cap, turned component.',1,'Draft','STEP','Arun','Arun',18,48),
 ('CNC-4210','Gear Blank','Inspection Drawing','Quality','Gear blank inspection drawing with GD&T.',5,'Released','PDF','Divya','Divya',60,9),
 ('CNC-4211','Shaft Coupling','Mechanical Drawing','Machining','Flexible shaft coupling, hardened.',2,'Approved','DXF','Priya','Priya',24,72),
 ('CNC-5021','Hydraulic Manifold','Assembly Drawing','Assembly','Manifold block with port schedule.',3,'Approved','PDF','Kumar','Divya',36,14),
 ('CNC-6014','Precision Bushing','Specification','Quality','Material and finish specification.',1,'Archived','DOCX','Ravi','Ravi',90,600)
) as v(pn,doc_name,doc_type,cat,descr,ver,st,ft,creator,updater,age,upd) on v.pn = pt.part_number;

insert into public.cncvault_documents (party_id, part_id, document_number, document_name, drawing_number, part_number, document_type, category, description, current_version, status, file_type, created_by_name, updated_by_name, created_at, updated_at)
select pa.id, null, pa.code || '-PROG-' || v.n, v.nm, null, v.pn, 'CNC Program', 'Programming', v.descr, v.ver, v.st::public.doc_status, 'NC', 'Arun', 'Arun', now() - interval '20 days', now() - (v.upd || ' hours')::interval
from public.cncvault_parties pa
join (values
 ('ABC','1001','Bracket Roughing Program','CNC-2456','3-axis roughing program.',2,'Released',30),
 ('XYZ','1002','Housing Finishing Program','CNC-3102','Finishing pass, 4-axis.',1,'Under Review',52)
) as v(code,n,nm,pn,descr,ver,st,upd) on v.code = pa.code;

insert into public.cncvault_document_versions (document_id, version_number, file_name, file_type, file_size, revision_notes, status, uploaded_by_name, uploaded_at)
select d.id, g.v,
  d.part_number || '_V' || g.v || '.' || lower(coalesce(d.file_type,'pdf')),
  d.file_type, 240000 + g.v * 51234,
  case g.v when 1 then 'Initial release.' else 'Revision ' || g.v || ': updated dimensions and notes.' end,
  case when g.v = d.current_version then d.status else 'Superseded'::public.doc_status end,
  d.created_by_name,
  d.updated_at - ((d.current_version - g.v) * 5 || ' days')::interval
from public.cncvault_documents d
cross join generate_series(1, 12) as g(v)
where g.v <= d.current_version;

insert into public.cncvault_audit_logs (user_name, action, document_id, document_number, version_number, party_name, details, ip_address, created_at)
select v.un, v.act, d.id, d.document_number, d.current_version, pa.name, v.det, '10.0.0.' || v.ipn, now() - (v.mins || ' minutes')::interval
from public.cncvault_documents d
join public.cncvault_parties pa on pa.id = d.party_id
join (values
 ('ABC-CNC-2456','Arun','Upload','Uploaded new revision',12,25),
 ('ABC-CNC-2456','Priya','View','Opened document detail',48,26),
 ('ABC-CNC-2456','Kumar','Download','Downloaded current version',95,27),
 ('XYZ-CNC-3102','Kumar','New Version','Created version 3',180,27),
 ('PQR-CNC-4210','Divya','Approval','Approved for release',320,31),
 ('KSS-CNC-5021','Admin','Permission Change','Updated document access list',420,10),
 ('ABC-CNC-2457','Kumar','Status Change','Status changed to Released',900,27),
 ('XYZ-PROG-1002','Arun','Upload','Uploaded CNC program',1200,25),
 ('PQR-CNC-4211','Priya','Download','Downloaded version 2',1500,26),
 ('PCL-CNC-6014','Ravi','Edit','Updated document metadata',2400,44)
) as v(docnum,un,act,det,mins,ipn) on v.docnum = d.document_number;

insert into public.cncvault_notifications (user_id, title, body, type, document_id, read, created_at)
select null, v.title, v.body, v.tp, d.id, v.rd, now() - (v.mins || ' minutes')::interval
from public.cncvault_documents d
join (values
 ('ABC-CNC-2456','New revision available','Bracket Assembly V4 has been uploaded by Arun.','revision',false,20),
 ('XYZ-CNC-3102','Document approval required','Spindle Housing V3 is awaiting quality review.','approval',false,180),
 ('PQR-CNC-4210','Document released','Gear Blank V5 has been released to production.','release',false,600),
 ('KSS-CNC-5021','Your document access has changed','Access rules for Hydraulic Manifold were updated.','access',true,900),
 ('ABC-CNC-2457','New document uploaded','Mounting Plate V2 was added to ABC Engineering.','upload',true,1600)
) as v(docnum,title,body,tp,rd,mins) on v.docnum = d.document_number;