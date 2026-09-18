CREATE TABLE IF NOT EXISTS public.cncvault_party_drives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id UUID NOT NULL REFERENCES public.cncvault_parties(id) ON DELETE CASCADE,
    drive_email TEXT NOT NULL,
    drive_refresh_token TEXT NOT NULL,
    drive_folder_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Copy existing data to the new table
INSERT INTO public.cncvault_party_drives (party_id, drive_email, drive_refresh_token, drive_folder_id)
SELECT id, drive_email, drive_refresh_token, drive_folder_id
FROM public.cncvault_parties
WHERE drive_refresh_token IS NOT NULL;

-- Enable RLS
ALTER TABLE public.cncvault_party_drives ENABLE ROW LEVEL SECURITY;

-- Policy for super admins or same party admins to view drives
CREATE POLICY "Users can view drives for their company or if super admin"
    ON public.cncvault_party_drives
    FOR SELECT
    USING (
        (SELECT party_id FROM public.cncvault_profiles WHERE user_id = auth.uid()) IS NULL
        OR
        (SELECT party_id FROM public.cncvault_profiles WHERE user_id = auth.uid()) = party_id
    );

-- Policy for super admins or same party admins to insert drives
CREATE POLICY "Users can insert drives for their company or if super admin"
    ON public.cncvault_party_drives
    FOR INSERT
    WITH CHECK (
        (SELECT party_id FROM public.cncvault_profiles WHERE user_id = auth.uid()) IS NULL
        OR
        (SELECT party_id FROM public.cncvault_profiles WHERE user_id = auth.uid()) = party_id
    );

-- Policy to delete
CREATE POLICY "Users can delete drives for their company or if super admin"
    ON public.cncvault_party_drives
    FOR DELETE
    USING (
        (SELECT party_id FROM public.cncvault_profiles WHERE user_id = auth.uid()) IS NULL
        OR
        (SELECT party_id FROM public.cncvault_profiles WHERE user_id = auth.uid()) = party_id
    );
