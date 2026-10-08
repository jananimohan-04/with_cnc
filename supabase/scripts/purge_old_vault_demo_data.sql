-- Removes the old demo data of the CNC vault (ABC Engineering, XYZ Industries, test documents, versions, folders, activity).
-- The app no longer reads these tables: Documents / Parts & Drawings / Dashboard now use the real pipeline files.
-- Users, roles and profiles are NOT touched, so nobody loses access.
--
-- 1. Run STEP 1 on its own and look at the counts.
-- 2. Run STEP 2. It ends with ROLLBACK, so nothing is deleted yet. Change ROLLBACK to COMMIT and run again to delete for real.

-- STEP 1: preview
select 'documents' as what, count(*) from cncvault_documents
union all select 'document_versions', count(*) from cncvault_document_versions
union all select 'document_permissions', count(*) from cncvault_document_permissions
union all select 'parts', count(*) from cncvault_parts
union all select 'parties', count(*) from cncvault_parties
union all select 'drive_folders', count(*) from cncvault_drive_folders
union all select 'party_drives', count(*) from cncvault_party_drives
union all select 'audit_logs', count(*) from cncvault_audit_logs
union all select 'notifications', count(*) from cncvault_notifications;

-- STEP 2: delete (children first)
begin;
delete from cncvault_notifications;
delete from cncvault_audit_logs;
delete from cncvault_document_permissions;
delete from cncvault_document_versions;
delete from cncvault_documents;
delete from cncvault_drive_folders;
delete from cncvault_party_drives;
delete from cncvault_parts;
delete from cncvault_parties;
rollback;  -- change to: commit;
