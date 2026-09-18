import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getAccessTokenFromRefresh(refreshToken: string, clientId: string, clientSecret: string) {
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('refresh_token', refreshToken);
  params.append('grant_type', 'refresh_token');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!res.ok) throw new Error('Failed to refresh token: ' + await res.text());
  const data = await res.json();
  return data.access_token;
}

async function findFolder(name: string, parentId: string, token: string): Promise<string | null> {
  let q = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Drive find folder failed: ${await res.text()}`);
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(name: string, parentId: string, token: string): Promise<string> {
  const body: any = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) body.parents = [parentId];

  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`Drive create folder failed: ${await res.text()}`);
  const data = await res.json();
  return data.id;
}

async function uploadFileToDrive(file: File, folderId: string, token: string) {
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name: file.name, parents: [folderId] })], { type: 'application/json' }));
  form.append('file', file);
  
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  
  if (!res.ok) throw new Error(`Drive file upload failed: ${await res.text()}`);
  return await res.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.pathname.split('/').pop();

    const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
    const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';

    // --- OAUTH FLOW ---
      if (action === 'auth-url') {
        const partyId = url.searchParams.get('partyId');
        if (!partyId) throw new Error('Missing partyId');
        const redirectUri = `https://poioxmtrlqbiurrpgehd.supabase.co/functions/v1/drive-api/callback`;
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=https://www.googleapis.com/auth/drive.file%20https://www.googleapis.com/auth/userinfo.email&access_type=offline&prompt=consent&state=${partyId}`;
        
        return new Response(JSON.stringify({ url: authUrl }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

    if (action === 'callback') {
      const code = url.searchParams.get('code');
      const partyId = url.searchParams.get('state');
      
      if (!code || !partyId) throw new Error('Missing code or state');

      const redirectUri = `https://poioxmtrlqbiurrpgehd.supabase.co/functions/v1/drive-api/callback`;
      const params = new URLSearchParams();
      params.append('client_id', GOOGLE_CLIENT_ID);
      params.append('client_secret', GOOGLE_CLIENT_SECRET);
      params.append('code', code);
      params.append('grant_type', 'authorization_code');
      params.append('redirect_uri', redirectUri);

      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });

      if (!res.ok) throw new Error('OAuth exchange failed: ' + await res.text());
      const data = await res.json();
      
      const refreshToken = data.refresh_token;
      if (!refreshToken) throw new Error('No refresh token received. You might need to revoke access in your Google Account and try again.');

      const accessToken = data.access_token;
      
      // Get user's email to store
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const userInfo = await userInfoRes.json();

      // Ensure root folder exists for this party
      const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
      
      const { data: partyData } = await supabaseClient.from('cncvault_parties').select('name').eq('id', partyId).single();
      const rootFolderName = `CNC Vault - ${partyData?.name || 'Workspace'}`;

      let rootFolderId = await findFolder(rootFolderName, '', accessToken);
      if (!rootFolderId) {
        rootFolderId = await createFolder(rootFolderName, '', accessToken);
      }

      await supabaseClient.from('cncvault_parties').update({ 
        drive_refresh_token: refreshToken,
        drive_folder_id: rootFolderId,
        drive_email: userInfo.email || ''
      }).eq('id', partyId);

      await supabaseClient.from('cncvault_party_drives').insert({
        party_id: partyId,
        drive_refresh_token: refreshToken,
        drive_folder_id: rootFolderId,
        drive_email: userInfo.email || ''
      });

      return new Response('<html><body><h1>Drive Connected Successfully!</h1><p>You can close this window now.</p><script>setTimeout(() => window.close(), 2000);</script></body></html>', {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    // --- AUTHORIZED ROUTES ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing Authorization header');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error('Unauthorized');

    if (action === 'status') {
      const partyId = url.searchParams.get('partyId');
      if (!partyId) throw new Error('partyId required');
      const { data } = await serviceClient.from('cncvault_parties').select('drive_refresh_token, drive_email').eq('id', partyId).maybeSingle();
      return new Response(JSON.stringify({ 
        connected: !!data?.drive_refresh_token,
        email: data?.drive_email 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'list-folders' && req.method === 'GET') {
      const partyId = url.searchParams.get('partyId');
      if (!partyId) throw new Error('partyId required');
      
      let dbFolders: any[] = [];
      try {
        const { data } = await serviceClient
          .from('cncvault_drive_folders')
          .select('*')
          .eq('party_id', partyId)
          .order('created_at', { ascending: true });
        if (data) dbFolders = data;
      } catch (_) {}

      // Also list directly from Google Drive API as fallback/primary
      const { data: partyData } = await serviceClient
        .from('cncvault_parties')
        .select('drive_refresh_token, drive_folder_id')
        .eq('id', partyId)
        .maybeSingle();

      if (partyData?.drive_refresh_token && partyData?.drive_folder_id) {
        try {
          const token = await getAccessTokenFromRefresh(partyData.drive_refresh_token, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
          const q = `'${partyData.drive_folder_id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
          const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,parents,createdTime)`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (driveRes.ok) {
            const driveData = await driveRes.json();
            const driveFolders = (driveData.files || []).map((f: any) => ({
              id: f.id,
              party_id: partyId,
              google_folder_id: f.id,
              name: f.name,
              parent_folder_id: null,
              created_at: f.createdTime || new Date().toISOString()
            }));

            const map = new Map();
            for (const f of dbFolders) {
              map.set(f.google_folder_id || f.id, f);
            }
            for (const f of driveFolders) {
              if (!map.has(f.id)) {
                map.set(f.id, f);
              }
            }
            return new Response(JSON.stringify({ folders: Array.from(map.values()) }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        } catch (driveErr) {
          console.error('Error fetching drive folders:', driveErr);
        }
      }

      return new Response(JSON.stringify({ folders: dbFolders }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'create-folder' && req.method === 'POST') {
      const body = await req.json();
      const { partyId, name, parentFolderId } = body;
      if (!partyId || !name) throw new Error('partyId and name required');

      const { data: profile } = await serviceClient
        .from('cncvault_profiles')
        .select('party_id')
        .eq('user_id', user.id)
        .maybeSingle();

      const isSuperAdmin = !profile?.party_id;
      const isSameParty = profile?.party_id === partyId;
      const { data: rbacCheck } = await supabaseClient.rpc('has_permission', { _user_id: user.id, _permission: 'manage_settings' });
      const { data: uploadCheck } = await supabaseClient.rpc('has_permission', { _user_id: user.id, _permission: 'upload' });

      if (!isSuperAdmin && !isSameParty && !rbacCheck && !uploadCheck) {
        throw new Error('Permission denied: You can only create folders for your assigned company.');
      }

      const { data: partyData } = await serviceClient
        .from('cncvault_parties')
        .select('drive_refresh_token, drive_folder_id')
        .eq('id', partyId)
        .single();

      if (!partyData?.drive_refresh_token) throw new Error('This party has not connected a Google Drive.');

      const token = await getAccessTokenFromRefresh(partyData.drive_refresh_token, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);

      let googleParentId = partyData.drive_folder_id;

      if (parentFolderId && parentFolderId !== 'root') {
        try {
          const { data: parentFolder } = await serviceClient
            .from('cncvault_drive_folders')
            .select('google_folder_id')
            .eq('id', parentFolderId)
            .maybeSingle();

          googleParentId = parentFolder?.google_folder_id || parentFolderId;
        } catch (_) {
          googleParentId = parentFolderId;
        }
      }

      const googleFolderId = await createFolder(name, googleParentId, token);

      let newFolderRecord: any = {
        id: googleFolderId,
        party_id: partyId,
        google_folder_id: googleFolderId,
        name,
        parent_folder_id: parentFolderId || null,
        created_at: new Date().toISOString()
      };

      try {
        const { data: dbRecord } = await serviceClient
          .from('cncvault_drive_folders')
          .insert({
            party_id: partyId,
            google_folder_id: googleFolderId,
            name,
            parent_folder_id: parentFolderId || null
          })
          .select()
          .single();
        if (dbRecord) newFolderRecord = dbRecord;
      } catch (dbErr) {
        console.warn('Could not store folder in DB table, returning Google Drive record:', dbErr);
      }

      return new Response(JSON.stringify({ folder: newFolderRecord }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'upload' && req.method === 'POST') {
      const formData = await req.formData();
      const file = formData.get('file') as File;
      const partyId = formData.get('partyId') as string;
      const documentNumber = formData.get('documentNumber') as string;
      const version = formData.get('version') as string;
      const targetFolderId = (formData.get('targetFolderId') as string) || '';

      const { data: profile } = await supabaseClient
        .from('cncvault_profiles')
        .select('party_id')
        .eq('user_id', user.id)
        .maybeSingle();

      const isSuperAdmin = !profile?.party_id;
      const isSameParty = profile?.party_id === partyId;
      const { data: rbacCheck } = await supabaseClient.rpc('has_permission', { _user_id: user.id, _permission: 'upload' });

      if (!isSuperAdmin && !isSameParty && !rbacCheck) {
        throw new Error('Permission denied');
      }
      if (!file || !partyId || !documentNumber || !version) {
        throw new Error('Missing fields');
      }

      // Lookup party tokens
      const { data: partyData } = await supabaseClient.from('cncvault_parties')
        .select('drive_refresh_token, drive_folder_id, name').eq('id', partyId).single();
      
      if (!partyData?.drive_refresh_token) throw new Error('This party has not connected a Google Drive.');

      const token = await getAccessTokenFromRefresh(partyData.drive_refresh_token, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
      
      // Create hierarchy
      let baseFolderId = partyData.drive_folder_id;
      if (targetFolderId) {
        const { data: targetFolderData } = await supabaseClient
          .from('cncvault_drive_folders')
          .select('google_folder_id')
          .eq('id', targetFolderId)
          .maybeSingle();
        if (targetFolderData?.google_folder_id) {
          baseFolderId = targetFolderData.google_folder_id;
        }
      }
      let docFolderId = await findFolder(documentNumber, baseFolderId, token);
      if (!docFolderId) docFolderId = await createFolder(documentNumber, baseFolderId, token);
      
      let versionFolderId = await findFolder(`V${version}`, docFolderId, token);
      if (!versionFolderId) versionFolderId = await createFolder(`V${version}`, docFolderId, token);

      const uploadedFile = await uploadFileToDrive(file, versionFolderId, token);

      return new Response(JSON.stringify({
        fileId: uploadedFile.id,
        folderId: versionFolderId,
        webViewLink: uploadedFile.webViewLink
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'sync-versions' && req.method === 'POST') {
      const body = await req.json();
      const { partyId } = body;
      if (!partyId) throw new Error('partyId required');

      const { data: profile } = await supabaseClient
        .from('cncvault_profiles')
        .select('party_id')
        .eq('user_id', user.id)
        .maybeSingle();

      const isSuperAdmin = !profile?.party_id;
      const isSameParty = profile?.party_id === partyId;

      if (!isSuperAdmin && !isSameParty) {
        throw new Error('Permission denied');
      }

      const { data: partyData } = await supabaseClient.from('cncvault_parties')
        .select('drive_refresh_token').eq('id', partyId).single();
      
      if (!partyData?.drive_refresh_token) {
        return new Response(JSON.stringify({ synced: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const token = await getAccessTokenFromRefresh(partyData.drive_refresh_token, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);

      const { data: documents } = await supabaseClient
        .from('cncvault_documents')
        .select('id, current_version, document_number, document_name')
        .eq('party_id', partyId);

      if (!documents || documents.length === 0) {
        return new Response(JSON.stringify({ synced: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      let syncedCount = 0;

      for (const doc of documents) {
        const { data: latestVersion } = await supabaseClient
          .from('cncvault_document_versions')
          .select('*')
          .eq('document_id', doc.id)
          .eq('version_number', doc.current_version)
          .single();

        if (latestVersion && latestVersion.google_drive_file_id) {
          try {
            const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${latestVersion.google_drive_file_id}?fields=modifiedTime,size`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (driveRes.ok) {
              const driveData = await driveRes.json();
              if (driveData.modifiedTime) {
                const driveModifiedTime = new Date(driveData.modifiedTime).getTime();
                const dbUploadedTime = new Date(latestVersion.uploaded_at).getTime();
                
                if (driveModifiedTime > dbUploadedTime + 5000) {
                  const newVersionNumber = doc.current_version + 1;
                  
                  await supabaseClient.from('cncvault_document_versions').insert({
                    document_id: doc.id,
                    version_number: newVersionNumber,
                    google_drive_file_id: latestVersion.google_drive_file_id,
                    drive_file_id: latestVersion.drive_file_id,
                    drive_folder_id: latestVersion.drive_folder_id,
                    drive_url: latestVersion.drive_url,
                    file_name: latestVersion.file_name,
                    file_size: driveData.size ? parseInt(driveData.size, 10) : latestVersion.file_size,
                    file_type: latestVersion.file_type,
                    uploaded_by: user.id,
                    revision_notes: "Auto-synced from Google Drive edits",
                    status: latestVersion.status,
                    uploaded_at: new Date(driveModifiedTime).toISOString()
                  });

                  await supabaseClient.from('cncvault_documents').update({
                    current_version: newVersionNumber
                  }).eq('id', doc.id);

                  syncedCount++;
                }
              }
            }
          } catch (e) {
            console.error('Error syncing document', doc.id, e);
          }
        }
      }

      return new Response(JSON.stringify({ synced: syncedCount }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'share-folder' && req.method === 'POST') {
      const body = await req.json();
      const { partyId, emailAddress } = body;
      if (!partyId || !emailAddress) throw new Error('partyId and emailAddress required');

      const { data: rbacCheck } = await supabaseClient.rpc('has_permission', { _user_id: user.id, _permission: 'manage_settings' });
      const { data: profile } = await supabaseClient.from('cncvault_profiles').select('party_id').eq('user_id', user.id).maybeSingle();
      const isSuperAdmin = !profile?.party_id;
      if (!rbacCheck && !isSuperAdmin) throw new Error('Permission denied');

      const { data: partyData } = await supabaseClient.from('cncvault_parties').select('drive_refresh_token, drive_folder_id').eq('id', partyId).single();
      if (!partyData?.drive_refresh_token || !partyData?.drive_folder_id) throw new Error('Drive not connected for this party');

      const token = await getAccessTokenFromRefresh(partyData.drive_refresh_token, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);

      const shareBody = {
        role: 'writer',
        type: 'user',
        emailAddress: emailAddress
      };

      const shareRes = await fetch(`https://www.googleapis.com/drive/v3/files/${partyData.drive_folder_id}/permissions?sendNotificationEmail=true`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(shareBody)
      });

      if (!shareRes.ok) throw new Error(`Failed to share folder: ${await shareRes.text()}`);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'share-files' && req.method === 'POST') {
      const body = await req.json();
      const { partyId, fileIds, emailAddress } = body;
      if (!partyId || !fileIds || !Array.isArray(fileIds) || !emailAddress) throw new Error('partyId, fileIds array, and emailAddress required');

      const { data: canUpload } = await supabaseClient.rpc('has_permission', { _user_id: user.id, _permission: 'upload' });
      const { data: profile } = await supabaseClient.from('cncvault_profiles').select('party_id').eq('user_id', user.id).maybeSingle();
      const isSuperAdmin = !profile?.party_id;
      
      // Technically sharing files might need a new permission, but 'upload' implies manage docs
      if (!canUpload && !isSuperAdmin) throw new Error('Permission denied');

      const { data: partyData } = await supabaseClient.from('cncvault_parties').select('drive_refresh_token').eq('id', partyId).single();
      if (!partyData?.drive_refresh_token) throw new Error('Drive not connected for this party');

      const token = await getAccessTokenFromRefresh(partyData.drive_refresh_token, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);

      const shareBody = {
        role: 'reader', // Share files as reader by default
        type: 'user',
        emailAddress: emailAddress
      };

      const results = [];
      for (const fileId of fileIds) {
        try {
          const shareRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?sendNotificationEmail=true`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(shareBody)
          });
          if (!shareRes.ok) throw new Error(await shareRes.text());
          results.push({ fileId, success: true });
        } catch (err: any) {
          results.push({ fileId, success: false, error: err.message });
        }
      }

      return new Response(JSON.stringify({ results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'list-file-permissions' && req.method === 'POST') {
      const body = await req.json();
      const { partyId, fileIds } = body;
      if (!partyId || !fileIds || !Array.isArray(fileIds)) throw new Error('partyId and fileIds array required');

      const { data: canUpload } = await supabaseClient.rpc('has_permission', { _user_id: user.id, _permission: 'upload' });
      const { data: profile } = await supabaseClient.from('cncvault_profiles').select('party_id').eq('user_id', user.id).maybeSingle();
      const isSuperAdmin = !profile?.party_id;
      if (!canUpload && !isSuperAdmin) throw new Error('Permission denied');

      const { data: partyData } = await supabaseClient.from('cncvault_parties').select('drive_refresh_token').eq('id', partyId).single();
      if (!partyData?.drive_refresh_token) throw new Error('Drive not connected for this party');

      const token = await getAccessTokenFromRefresh(partyData.drive_refresh_token, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);

      const allEmails = new Set<string>();
      for (const fileId of fileIds) {
        try {
          const shareRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?fields=permissions(id,emailAddress,role)`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`
            }
          });
          if (!shareRes.ok) continue;
          const data = await shareRes.json();
          const permissions = data.permissions || [];
          for (const perm of permissions) {
            if (perm.emailAddress && perm.role !== 'owner') {
              allEmails.add(perm.emailAddress);
            }
          }
        } catch (err: any) {}
      }

      return new Response(JSON.stringify({ emails: Array.from(allEmails) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'unshare-files' && req.method === 'POST') {
      const body = await req.json();
      const { partyId, fileIds, emailAddress } = body;
      if (!partyId || !fileIds || !Array.isArray(fileIds) || !emailAddress) throw new Error('partyId, fileIds array, and emailAddress required');

      const { data: canUpload } = await supabaseClient.rpc('has_permission', { _user_id: user.id, _permission: 'upload' });
      const { data: profile } = await supabaseClient.from('cncvault_profiles').select('party_id').eq('user_id', user.id).maybeSingle();
      const isSuperAdmin = !profile?.party_id;
      if (!canUpload && !isSuperAdmin) throw new Error('Permission denied');

      const { data: partyData } = await supabaseClient.from('cncvault_parties').select('drive_refresh_token').eq('id', partyId).single();
      if (!partyData?.drive_refresh_token) throw new Error('Drive not connected for this party');

      const token = await getAccessTokenFromRefresh(partyData.drive_refresh_token, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);

      let successCount = 0;
      for (const fileId of fileIds) {
        try {
          // First get the permissionId for this email
          const getRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?fields=permissions(id,emailAddress)`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!getRes.ok) continue;
          const data = await getRes.json();
          const permission = (data.permissions || []).find((p: any) => p.emailAddress === emailAddress);
          
          if (permission && permission.id) {
            // Delete the permission
            const delRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${permission.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` }
            });
            if (delRes.ok) successCount++;
          }
        } catch (err: any) {}
      }

      return new Response(JSON.stringify({ success: true, count: successCount }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if ((action === 'download' || action === 'view') && req.method === 'GET') {
      const driveFileId = url.searchParams.get('fileId');
      const documentId = url.searchParams.get('documentId');
      if (!driveFileId || !documentId) throw new Error('Missing fileId or documentId');

      const { data: canAccess } = await supabaseClient.rpc('can_access_document', { _user_id: user.id, _document_id: documentId });
      if (!canAccess) throw new Error('Permission denied');

      // Get the document's party to get the right refresh token
      const { data: docData } = await supabaseClient.from('cncvault_documents').select('party_id').eq('id', documentId).single();
      if (!docData) throw new Error('Document not found');

      const { data: partyData } = await supabaseClient.from('cncvault_parties').select('drive_refresh_token').eq('id', docData.party_id).single();
      if (!partyData?.drive_refresh_token) throw new Error('Drive not connected for this document');

      const token = await getAccessTokenFromRefresh(partyData.drive_refresh_token, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);

      const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!driveRes.ok) throw new Error(`Drive fetch failed: ${driveRes.statusText}`);

      const headers = new Headers(corsHeaders);
      const contentType = driveRes.headers.get('Content-Type');
      if (contentType) headers.set('Content-Type', contentType);
      headers.set('Content-Disposition', action === 'download' ? 'attachment' : 'inline');

      return new Response(driveRes.body, { headers });
    }

    throw new Error('Unknown route');
    
  } catch (error: any) {
    console.error('Edge function error:', error.message, error.stack);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
