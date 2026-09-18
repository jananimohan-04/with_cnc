import { supabase } from "@/integrations/supabase/client";

/**
 * Google Drive Service Abstraction
 * 
 * This service mediates communication with the secure Supabase Edge Function `drive-api`.
 * Credentials are NOT exposed to the client.
 */

export interface DriveFolder {
  id: string;
  party_id: string;
  google_folder_id: string;
  name: string;
  parent_folder_id: string | null;
  created_at: string;
}

export interface GoogleDriveConfig {
  isConnected: boolean;
  error?: string;
}

export interface GoogleDriveUploadResult {
  fileId: string;
  folderId: string;
  webViewLink: string;
}

export class GoogleDriveService {
  /**
   * Checks if the Google Drive integration is fully configured on the server.
   */
  static async checkConfigurationStatus(partyId: string): Promise<GoogleDriveConfig> {
    try {
      const { data, error } = await supabase.functions.invoke(`drive-api/status?partyId=${partyId}`, { method: 'GET' });
      if (error) throw error;
      return {
        isConnected: data.connected,
        error: data.error,
      };
    } catch (e: any) {
      console.error("Drive config error:", e);
      return { isConnected: false, error: e.message };
    }
  }

  /**
   * Uploads a file buffer/blob to Google Drive via the Edge Function.
   */
  static async uploadFile(
    file: File, 
    metadata: { partyId: string; documentNumber: string; version: number; targetFolderId?: string }
  ): Promise<GoogleDriveUploadResult> {
    const form = new FormData();
    form.append('file', file);
    form.append('partyId', metadata.partyId);
    form.append('documentNumber', metadata.documentNumber);
    form.append('version', metadata.version.toString());
    if (metadata.targetFolderId) {
      form.append('targetFolderId', metadata.targetFolderId);
    }

    // Call Edge Function
    const { data, error } = await supabase.functions.invoke('drive-api/upload', {
      body: form,
      // Supabase handles the auth headers automatically
    });

    if (error) throw new Error(error.message || "Failed to upload to Google Drive");

    return {
      fileId: data.fileId,
      folderId: data.folderId,
      webViewLink: data.webViewLink,
    };
  }

  /**
   * Proxies a file view request through the edge function.
   * Ensures permissions are verified.
   */
  static async getViewUrl(driveFileId: string, documentId: string): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    
    // Instead of downloading it here into memory, we construct a URL that the browser can use 
    // to proxy the request. However, browser <img> or <iframe> tags can't easily pass Authorization headers.
    // In a real production system with JWT, we might generate a signed URL from the edge function
    // or proxy it. For this demonstration, we'll fetch the blob securely and create a local object URL.
    
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drive-api/view?fileId=${driveFileId}&documentId=${documentId}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      let errMessage = "Failed to load document preview";
      try {
        const errData = await res.json();
        if (errData.error) errMessage = errData.error;
      } catch (e) {}
      throw new Error(errMessage);
    }

    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }

  /**
   * Proxies a file download request.
   */
  static async downloadFile(driveFileId: string, documentId: string, fileName: string): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drive-api/download?fileId=${driveFileId}&documentId=${documentId}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Permission denied or file unavailable");
    }

    // Securely trigger the download
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Lists folders for a company/party.
   */
  static async listFolders(partyId: string): Promise<DriveFolder[]> {
    const { data, error } = await supabase.functions.invoke(`drive-api/list-folders?partyId=${partyId}`, { method: 'GET' });
    if (error) throw error;
    return data.folders || [];
  }

  /**
   * Creates a new folder inside Google Drive and stores the metadata in the database.
   */
  static async createFolder(partyId: string, name: string, parentFolderId?: string): Promise<DriveFolder> {
    const { data, error } = await supabase.functions.invoke('drive-api/create-folder', {
      body: { partyId, name, parentFolderId }
    });
    if (error) throw new Error(error.message || "Failed to create folder");
    return data.folder;
  }

  /**
   * Syncs document versions from Google Drive
   */
  static async syncVersions(partyId: string): Promise<{ synced: number }> {
    const { data, error } = await supabase.functions.invoke('drive-api/sync-versions', {
      body: { partyId }
    });
    if (error) throw new Error(error.message || "Failed to sync versions");
    return data;
  }

  /**
   * Shares the root workspace folder with an employee email.
   */
  static async shareFolder(partyId: string, emailAddress: string): Promise<{ success: boolean }> {
    const { data, error } = await supabase.functions.invoke('drive-api/share-folder', {
      body: { partyId, emailAddress }
    });
    if (error) throw new Error(error.message || "Failed to share folder");
    return data;
  }

  /**
   * Shares specific documents with an external email.
   */
  static async shareFiles(partyId: string, fileIds: string[], emailAddress: string): Promise<{ results: any[] }> {
    const { data, error } = await supabase.functions.invoke('drive-api/share-files', {
      body: { partyId, fileIds, emailAddress }
    });
    if (error) throw new Error(error.message || "Failed to share files");
    return data;
  }

  /**
   * Lists emails that have access to the provided files.
   */
  static async listFilePermissions(partyId: string, fileIds: string[]): Promise<{ emails: string[] }> {
    const { data, error } = await supabase.functions.invoke('drive-api/list-file-permissions', {
      body: { partyId, fileIds }
    });
    if (error) throw new Error(error.message || "Failed to list permissions");
    return data;
  }

  /**
   * Revokes access to the provided files for an email.
   */
  static async unshareFiles(partyId: string, fileIds: string[], emailAddress: string): Promise<{ success: boolean, count: number }> {
    const { data, error } = await supabase.functions.invoke('drive-api/unshare-files', {
      body: { partyId, fileIds, emailAddress }
    });
    if (error) throw new Error(error.message || "Failed to unshare files");
    return data;
  }
}
