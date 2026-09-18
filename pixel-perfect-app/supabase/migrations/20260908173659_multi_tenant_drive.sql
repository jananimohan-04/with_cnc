-- Add Google Drive OAuth fields to parties
ALTER TABLE public.cncvault_parties 
ADD COLUMN drive_refresh_token TEXT,
ADD COLUMN drive_folder_id TEXT,
ADD COLUMN drive_email TEXT;

-- Add party_id to profiles to link users to a company
ALTER TABLE public.cncvault_profiles 
ADD COLUMN party_id UUID REFERENCES public.cncvault_parties(id) ON DELETE SET NULL;

-- Update the document access policy to respect the user's party
CREATE OR REPLACE FUNCTION public.can_access_document(_user_id uuid, _document_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_doc_admin(_user_id)
    OR EXISTS (
      -- The document belongs to the user's party
      SELECT 1 FROM public.cncvault_documents d
      JOIN public.cncvault_profiles p ON p.party_id = d.party_id
      WHERE d.id = _document_id AND p.user_id = _user_id
    )
    OR NOT EXISTS (SELECT 1 FROM public.cncvault_document_permissions dp WHERE dp.document_id = _document_id)
    OR EXISTS (
      SELECT 1 FROM public.cncvault_document_permissions dp
      WHERE dp.document_id = _document_id
        AND (
          dp.user_id = _user_id
          OR dp.role_id IN (SELECT role_id FROM public.cncvault_user_roles WHERE user_id = _user_id)
          OR dp.department = (SELECT department FROM public.cncvault_profiles WHERE user_id = _user_id)
        )
    )
$$;
