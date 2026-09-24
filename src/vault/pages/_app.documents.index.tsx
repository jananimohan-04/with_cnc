import { createFileRoute, Link, useNavigate } from "@/vault/router-adapter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/vault/integrations/supabase/client";
import { listDocuments, listParties } from "@/vault/lib/api";
import { usePermissions } from "@/vault/hooks/use-permissions";
import { Button } from "@/vault/components/ui/button";
import { Input } from "@/vault/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/vault/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/vault/components/ui/table";
import { Badge } from "@/vault/components/ui/badge";
import { format } from "date-fns";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/vault/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/vault/components/ui/dialog";
import { Label } from "@/vault/components/ui/label";
import { Checkbox } from "@/vault/components/ui/checkbox";
import { Building, MoreHorizontal, FileText, Search, Plus, FilterX, Eye, Download, History, Shield, Info, Folder, LayoutGrid, List, ChevronDown, ChevronRight, FolderOpen, ExternalLink, RefreshCw, Laptop } from "lucide-react";
import { GoogleDriveService, DriveFolder } from "@/vault/services/google-drive";
import { DOC_STATUSES, DOCUMENT_TYPES } from "@/vault/lib/rbac";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/documents/")({
  component: DocumentsPage,
});

function DocumentRow({ doc, can, navigate, onPreview, onDownload, onOpenLocally, isSelected, onSelect }: { doc: any; can: any; navigate: any; onPreview?: any; onDownload?: any; onOpenLocally?: any; isSelected?: boolean; onSelect?: (id: string) => void; }) {
  const latestVer = doc.versions?.[0];
  return (
    <TableRow key={doc.id} className="hover:bg-slate-50">
      <TableCell className="w-[40px] pl-4">
        {onSelect && (
          <Checkbox 
            checked={isSelected} 
            onCheckedChange={() => onSelect(doc.id)}
            aria-label="Select document"
          />
        )}
      </TableCell>
      <TableCell>
        <div className="font-medium text-indigo-600">{doc.document_number}</div>
        <div className="text-xs text-slate-500">v{doc.current_version} | {doc.file_type?.toUpperCase()}</div>
      </TableCell>
      <TableCell>
        <div className="text-sm text-slate-900 truncate max-w-[200px]">{doc.document_name}</div>
        <div className="text-xs text-slate-500">PN: {doc.part_number}</div>
      </TableCell>
      <TableCell>
        <div className="text-sm text-slate-700">{doc.parties?.name || "Internal"}</div>
      </TableCell>
      <TableCell>
        <Badge variant={doc.status === "Approved" || doc.status === "Released" ? "default" : doc.status === "Superseded" ? "secondary" : "outline"}>
          {doc.status}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="text-sm text-slate-700">{format(new Date(doc.updated_at), "MMM d, yyyy")}</div>
        <div className="text-xs text-slate-500">{doc.updated_by_name}</div>
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {latestVer && (
              <DropdownMenuItem onClick={() => onOpenLocally?.(doc, latestVer)}>
                <Laptop className="mr-2 h-4 w-4 text-indigo-600" /> Open Locally (CAD)
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => navigate({ to: `/documents/${doc.id}` })}>
              <Info className="mr-2 h-4 w-4" /> Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate({ to: `/documents/${doc.id}` })}>
              <History className="mr-2 h-4 w-4" /> Version History
            </DropdownMenuItem>
            {can("view") && latestVer?.google_drive_file_id && (
              <DropdownMenuItem onClick={() => onPreview?.(latestVer.google_drive_file_id, doc.id)}>
                <Eye className="mr-2 h-4 w-4" /> Preview
              </DropdownMenuItem>
            )}
            {can("download") && latestVer?.google_drive_file_id && (
              <DropdownMenuItem onClick={() => onDownload?.(latestVer.google_drive_file_id, doc.id, latestVer.file_name)}>
                <Download className="mr-2 h-4 w-4" /> Download
              </DropdownMenuItem>
            )}
            {latestVer?.google_drive_file_id && (
              <DropdownMenuItem onClick={() => window.open(`https://drive.google.com/file/d/${latestVer.google_drive_file_id}/view`, '_blank')}>
                <ExternalLink className="mr-2 h-4 w-4 text-emerald-600" /> Open in Google Drive
              </DropdownMenuItem>
            )}
            {can("manage_access") && (
              <DropdownMenuItem onClick={() => navigate({ to: `/documents/${doc.id}` })}>
                <Shield className="mr-2 h-4 w-4" /> Manage Access
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function DocumentsPage() {
  const { can, isSuperAdmin, isCompanyAdmin, isNormalUser, userPartyId, profile } = usePermissions();
  const navigate = useNavigate();
  
  const [search, setSearch] = useState("");
  const [partyId, setPartyId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [docType, setDocType] = useState<string>("all");
  const [folderId, setFolderId] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"list" | "folders">("folders");
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [showBatchShareDialog, setShowBatchShareDialog] = useState(false);
  const [batchShareEmail, setBatchShareEmail] = useState("");
  const [isBatchSharing, setIsBatchSharing] = useState(false);
  const [sharedEmails, setSharedEmails] = useState<string[]>([]);
  const [isLoadingSharedEmails, setIsLoadingSharedEmails] = useState(false);

  const [localDrivePath, setLocalDrivePath] = useState("G:\\My Drive\\CNC Vault");
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("localDrivePath");
    if (saved) setLocalDrivePath(saved);
  }, []);

  const handleSaveSettings = () => {
    localStorage.setItem("localDrivePath", localDrivePath);
    setShowSettingsDialog(false);
    toast.success("Local Drive Path saved.");
  };

  const handleShareWorkspace = async () => {
    if (!shareEmail) return toast.error("Please enter an email address");
    const targetPartyId = profile?.party_id || partyId;
    if (!targetPartyId || targetPartyId === 'all') return toast.error("Please select a specific workspace/company first");
    
    setIsSharing(true);
    try {
      await GoogleDriveService.shareFolder(targetPartyId, shareEmail);
      toast.success(`Workspace shared with ${shareEmail}! They can now add it to their Google Drive.`);
      setShareEmail("");
    } catch (e: any) {
      toast.error(e.message || "Failed to share workspace");
    } finally {
      setIsSharing(false);
    }
  };

  const fetchSharedEmails = async () => {
    const selectedDocsData = data?.rows?.filter(d => selectedDocIds.includes(d.id)) || [];
    const targetPartyId = selectedDocsData[0]?.party_id || profile?.party_id || partyId;
    if (!targetPartyId || targetPartyId === 'all') return;
    const fileIds = selectedDocsData.map(d => d.versions?.[0]?.google_drive_file_id || d.google_drive_file_id).filter(Boolean) as string[];
    if (fileIds.length === 0) return;

    setIsLoadingSharedEmails(true);
    try {
      const res = await GoogleDriveService.listFilePermissions(targetPartyId, fileIds);
      setSharedEmails(res.emails || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load shared emails");
    } finally {
      setIsLoadingSharedEmails(false);
    }
  };

  useEffect(() => {
    if (showBatchShareDialog && selectedDocIds.length > 0) {
      fetchSharedEmails();
    } else {
      setSharedEmails([]);
      setBatchShareEmail("");
    }
  }, [showBatchShareDialog, selectedDocIds]);

  const handleUnshare = async (email: string) => {
    const selectedDocsData = data?.rows?.filter(d => selectedDocIds.includes(d.id)) || [];
    const targetPartyId = selectedDocsData[0]?.party_id || profile?.party_id || partyId;
    if (!targetPartyId || targetPartyId === 'all') return;
    const fileIds = selectedDocsData.map(d => d.versions?.[0]?.google_drive_file_id || d.google_drive_file_id).filter(Boolean) as string[];

    const toastId = toast.loading(`Unsharing from ${email}...`);
    try {
      const res = await GoogleDriveService.unshareFiles(targetPartyId, fileIds, email);
      toast.success(`Revoked access for ${email} from ${res.count} document(s)`, { id: toastId });
      fetchSharedEmails();
    } catch (e: any) {
      toast.error(e.message || "Failed to unshare", { id: toastId });
    }
  };

  const handleBatchShare = async () => {
    if (!batchShareEmail) return toast.error("Please enter an email address");
    
    // Get drive file ids for selected docs
    const selectedDocsData = data?.rows?.filter(d => selectedDocIds.includes(d.id)) || [];
    
    const targetPartyId = selectedDocsData[0]?.party_id || profile?.party_id || partyId;
    if (!targetPartyId || targetPartyId === 'all') return toast.error("Please select a specific workspace/company first");

    const fileIds = selectedDocsData.map(d => d.versions?.[0]?.google_drive_file_id || d.google_drive_file_id).filter(Boolean) as string[];
    if (!fileIds || fileIds.length === 0) return toast.error("None of the selected documents have Google Drive files attached.");

    setIsBatchSharing(true);
    try {
      await GoogleDriveService.shareFiles(targetPartyId, fileIds, batchShareEmail);
      toast.success(`Shared ${fileIds.length} documents with ${batchShareEmail}!`);
      setBatchShareEmail("");
      fetchSharedEmails();
    } catch (e: any) {
      toast.error(e.message || "Failed to share documents");
    } finally {
      setIsBatchSharing(false);
    }
  };

  const toggleFolderExpand = (id: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };
  const [page, setPage] = useState(1);

  const handlePreview = (fileId: string, docId: string) => {
    toast.loading("Loading preview...");
    GoogleDriveService.getViewUrl(fileId, docId)
      .then(url => {
        toast.dismiss();
        window.open(url, '_blank');
      })
      .catch(e => {
        toast.dismiss();
        toast.error(e.message || "Failed to preview file");
      });
  };

  const handleDownload = (fileId: string, docId: string, fileName: string) => {
    toast.loading("Downloading file...");
    GoogleDriveService.downloadFile(fileId, docId, fileName)
      .then(() => toast.dismiss())
      .catch(e => {
        toast.dismiss();
        toast.error(e.message || "Failed to download file");
      });
  };

  const handleOpenLocally = async (doc: any, version: any) => {
    toast.loading("Opening document locally...");
    try {
      let basePath = localStorage.getItem("localDrivePath") || "G:\\My Drive\\CNC Vault";
      if (basePath.endsWith('\\')) basePath = basePath.slice(0, -1);
      if (basePath.endsWith('/')) basePath = basePath.slice(0, -1);
      const fullPath = `${basePath}\\${doc.document_number}\\V${version.version_number}\\${version.file_name}`;

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || "";
      const fileId = version.google_drive_file_id || version.drive_file_id;
      const downloadUrl = fileId 
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drive-api/download?fileId=${fileId}&documentId=${doc.id}` 
        : "";

      const payloadObj = {
        fileName: version.file_name,
        documentNumber: doc.document_number,
        versionNumber: version.version_number,
        fullPath: fullPath,
        downloadUrl: downloadUrl,
        authToken: token,
      };

      const base64EncodeUnicode = (str: string) => {
        return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
            function toSolidBytes(_match, p1) {
                return String.fromCharCode(parseInt(p1, 16));
        }));
      };
      const encodedPayload = base64EncodeUnicode(JSON.stringify(payloadObj));
      window.location.href = `cncvault://open?b64payload=${encodedPayload}`;
      setTimeout(() => toast.dismiss(), 2000);
    } catch (err: any) {
      toast.dismiss();
      toast.error(err.message || "Failed to initiate local launcher");
    }
  };

  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncDrive = async () => {
    const targetPartyId = userPartyId || (partyId !== "all" ? partyId : undefined);
    
    if (!targetPartyId) {
      toast.error("Please select a specific company to sync");
      return;
    }
    
    setIsSyncing(true);
    toast.loading("Syncing Drive changes...", { id: "sync" });
    try {
      const result = await GoogleDriveService.syncVersions(targetPartyId);
      toast.dismiss("sync");
      toast.success(`Synced successfully. Found ${result.synced} updated file(s).`);
      if (result.synced > 0) {
        queryClient.invalidateQueries({ queryKey: ["documents"] });
        queryClient.invalidateQueries({ queryKey: ["parts"] });
      }
    } catch (e: any) {
      toast.dismiss("sync");
      toast.error(e.message || "Failed to sync Drive");
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const targetPartyId = userPartyId || (partyId !== "all" ? partyId : undefined);
    if (!targetPartyId) return;

    const lastSyncStr = sessionStorage.getItem(`last_drive_sync_${targetPartyId}`);
    const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;
    
    // Auto-sync every 60 seconds when on this page
    if (Date.now() - lastSync > 60000) {
      sessionStorage.setItem(`last_drive_sync_${targetPartyId}`, Date.now().toString());
      GoogleDriveService.syncVersions(targetPartyId).then(res => {
        if (res.synced > 0) {
          toast.success(`Auto-synced: Found ${res.synced} updated file(s) from Drive.`);
          queryClient.invalidateQueries({ queryKey: ["documents"] });
          queryClient.invalidateQueries({ queryKey: ["parts"] });
        }
      }).catch(() => {
        // Silent fail for auto-sync
      });
    }
  }, [userPartyId, partyId, queryClient]);

  const pageSize = 12;

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Scope strictly to user's company if user has an assigned company
  const effectivePartyId = userPartyId || (partyId !== "all" ? partyId : undefined);

  const { data: parties } = useQuery({
    queryKey: ["parties-list"],
    queryFn: listParties,
  });

  const { data: partyFolders } = useQuery({
    queryKey: ["drive_folders", effectivePartyId],
    queryFn: () => GoogleDriveService.listFolders(effectivePartyId!),
    enabled: !!effectivePartyId,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["documents", debouncedSearch, effectivePartyId, folderId, status, docType, page, viewMode],
    queryFn: () => listDocuments({
      search: debouncedSearch || undefined,
      partyId: effectivePartyId,
      folderId: folderId !== "all" ? folderId : undefined,
      status: status !== "all" ? status : undefined,
      documentType: docType !== "all" ? docType : undefined,
      page: viewMode === "list" ? page : 1,
      pageSize: viewMode === "list" ? pageSize : 100,
    }),
  });

  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    if (isSuperAdmin || isCompanyAdmin) return data.rows;
    // Normal dept user (Viewer / Engineer): see company documents that are Approved, Released, or created by them
    return data.rows.filter(doc => 
      doc.status === "Approved" || 
      doc.status === "Released" || 
      doc.updated_by_name === profile?.full_name
    );
  }, [data, isSuperAdmin, isCompanyAdmin, profile]);

  const handleResetFilters = () => {
    setSearch("");
    setPartyId("all");
    setFolderId("all");
    setStatus("all");
    setDocType("all");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Documents</h2>
          <p className="text-muted-foreground mt-1">
            Manage engineering drawings, CNC programs, and documents.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-slate-100 p-1 rounded-lg border flex items-center gap-1">
            <Button
              size="sm"
              variant={viewMode === "folders" ? "secondary" : "ghost"}
              className={`h-8 text-xs font-medium ${viewMode === "folders" ? "bg-white shadow-sm text-indigo-600" : "text-slate-600"}`}
              onClick={() => setViewMode("folders")}
            >
              <Folder className="w-3.5 h-3.5 mr-1.5" />
              Folder View
            </Button>
            <Button
              size="sm"
              variant={viewMode === "list" ? "secondary" : "ghost"}
              className={`h-8 text-xs font-medium ${viewMode === "list" ? "bg-white shadow-sm text-indigo-600" : "text-slate-600"}`}
              onClick={() => setViewMode("list")}
            >
              <List className="w-3.5 h-3.5 mr-1.5" />
              List View
            </Button>
          </div>

          <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" className="bg-white hover:bg-slate-50 text-slate-700 border-slate-200">
                <Laptop className="w-4 h-4 mr-2" />
                Local Setup
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Local Workspace Setup</DialogTitle>
                <DialogDescription>
                  Configure how CNC Vault connects to your local CAD software.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Step 1: Install Windows Helper</Label>
                  <p className="text-sm text-muted-foreground">Download and run this file once to allow CNC Vault to open local software.</p>
                  <Button variant="outline" onClick={() => {
                    const link = document.createElement("a");
                    link.href = "/setup-launcher.bat";
                    link.download = "setup-launcher.bat";
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}>Download Windows Helper</Button>
                </div>
                <div className="space-y-2">
                  <Label>Step 2: Local Drive Path</Label>
                  <p className="text-sm text-muted-foreground">The folder where Google Drive Desktop is installed on this PC.</p>
                  <Input value={localDrivePath} onChange={(e) => setLocalDrivePath(e.target.value)} />
                </div>
                <div className="space-y-2 pt-4 border-t">
                  <Label>Team Workspace Sharing</Label>
                  <p className="text-sm text-muted-foreground">Share this CNC Vault workspace with a teammate's Google Account so they can mount it.</p>
                  <div className="flex gap-2">
                    <Input placeholder="employee@company.com" value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} />
                    <Button variant="secondary" onClick={handleShareWorkspace} disabled={isSharing}>
                      {isSharing ? 'Sharing...' : 'Share'}
                    </Button>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleSaveSettings}>Save Settings</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {can("upload") && (
            <>
              <Button 
                onClick={handleSyncDrive} 
                disabled={isSyncing} 
                variant="outline" 
                className="bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                Sync Drive
              </Button>
              <Button onClick={() => navigate({ to: "/parts" })} className="bg-indigo-600 hover:bg-indigo-700">
                <Plus className="w-4 h-4 mr-2" />
                Upload Document
              </Button>
            </>
          )}
        </div>
      </div>

      {selectedDocIds.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-indigo-800 text-sm">{selectedDocIds.length} document(s) selected</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="bg-white" onClick={() => setSelectedDocIds([])}>
              Clear
            </Button>
            <Dialog open={showBatchShareDialog} onOpenChange={setShowBatchShareDialog}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 shadow-sm">
                  Share Selected
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Share Documents via Google Drive</DialogTitle>
                  <DialogDescription>
                    Grant an external user read access to the selected documents in Google Drive. This does not share the entire workspace.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Recipient Email</Label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="vendor@example.com" 
                        value={batchShareEmail} 
                        onChange={e => setBatchShareEmail(e.target.value)} 
                        onKeyDown={e => e.key === 'Enter' && handleBatchShare()}
                      />
                      <Button onClick={handleBatchShare} disabled={isBatchSharing}>
                        {isBatchSharing ? 'Sharing...' : 'Share'}
                      </Button>
                    </div>
                  </div>

                  {isLoadingSharedEmails ? (
                    <div className="text-sm text-slate-500 text-center py-2">Loading permissions...</div>
                  ) : sharedEmails.length > 0 ? (
                    <div className="space-y-2 mt-4">
                      <Label className="text-xs text-slate-500 uppercase tracking-wider">Currently Shared With</Label>
                      <div className="bg-slate-50 rounded-md border border-slate-200 divide-y divide-slate-200 max-h-[200px] overflow-y-auto">
                        {sharedEmails.map(email => (
                          <div key={email} className="flex items-center justify-between p-2.5 text-sm">
                            <span className="text-slate-700 font-medium">{email}</span>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleUnshare(email)}>
                              Unshare
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500 text-center py-2 mt-4">Not shared with any external users yet.</div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowBatchShareDialog(false)}>Close</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      )}

      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Search by doc number, part, or name..."
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {userPartyId ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-md text-xs font-semibold text-indigo-700 w-full truncate">
              <Building className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="truncate">{parties?.find(p => p.id === userPartyId)?.name || "My Company"}</span>
            </div>
          ) : (
            <Select value={partyId} onValueChange={(v) => { setPartyId(v); setFolderId("all"); setPage(1); }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Party" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Parties</SelectItem>
                {parties?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={folderId} onValueChange={(v) => { setFolderId(v); setPage(1); }}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Drive Folder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Folders</SelectItem>
              <SelectItem value="root">CNC Vault (Root)</SelectItem>
              {partyFolders?.map((f) => (
                <SelectItem key={f.id} value={f.google_folder_id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {DOC_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={docType} onValueChange={(v) => { setDocType(v); setPage(1); }}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {DOCUMENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={handleResetFilters} className="w-full">
            <FilterX className="w-4 h-4 mr-2" />
            Reset
          </Button>
        </div>
      </div>

      {/* Full Google Drive Tree Explorer View */}
      {viewMode === "folders" ? (
        <div className="space-y-6">
          {isLoading ? (
            <div className="bg-white p-8 rounded-lg border text-center text-slate-500">Loading Google Drive structure...</div>
          ) : (
            (() => {
              // Determine company/parties to display:
              // If effectivePartyId is set (company user), ONLY show that company!
              const targetParties = effectivePartyId
                ? (parties?.filter(p => p.id === effectivePartyId) || [])
                : (parties || []);

              if (targetParties.length === 0) {
                return (
                  <div className="bg-white p-8 rounded-lg border text-center text-slate-500">
                    <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p>No documents found matching your criteria.</p>
                  </div>
                );
              }

              return targetParties.map((partyInfo) => {
                const partyDocs = filteredRows.filter(doc => doc.party_id === partyInfo.id);

                // Group party documents by Folder ID
                const folderMap: Record<string, any[]> = {};
                partyDocs.forEach(doc => {
                  const fKey = doc.drive_folder_id || 'root';
                  if (!folderMap[fKey]) folderMap[fKey] = [];
                  folderMap[fKey].push(doc);
                });

                const folderEntries: { id: string; name: string; docs: any[] }[] = [];

                if (folderId === "all" || folderId === "root") {
                  folderEntries.push({
                    id: 'root',
                    name: 'CNC Vault (Root Folder)',
                    docs: folderMap['root'] || []
                  });
                }

                // Add custom folders from Google Drive
                partyFolders?.forEach(f => {
                  if (folderId === "all" || folderId === f.google_folder_id) {
                    folderEntries.push({
                      id: f.google_folder_id,
                      name: f.name,
                      docs: folderMap[f.google_folder_id] || []
                    });
                  }
                });

                // Add any remaining folder IDs with documents
                Object.keys(folderMap).forEach(k => {
                  if (k !== 'root' && !folderEntries.some(e => e.id === k)) {
                    if (folderId === "all" || folderId === k) {
                      folderEntries.push({
                        id: k,
                        name: `Folder (${k.substring(0, 8)}...)`,
                        docs: folderMap[k]
                      });
                    }
                  }
                });

                return (
                  <div key={partyInfo.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    {/* Party / Company Header */}
                    <div className="bg-slate-100/90 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Building className="w-5 h-5 text-indigo-600" />
                        <h3 className="font-bold text-slate-900 text-base">{partyInfo.name}</h3>
                        {(partyInfo.drive_email || partyInfo.drive_refresh_token) && (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs font-normal">
                            ✓ Google Drive Connected
                          </Badge>
                        )}
                      </div>
                      <Badge variant="secondary" className="text-xs font-medium">
                        {partyDocs.length} {partyDocs.length === 1 ? 'document' : 'documents'}
                      </Badge>
                    </div>

                    {/* Folders List */}
                    <div className="p-4 space-y-3 bg-slate-50/50">
                      {folderEntries.map(folder => {
                        const isExpanded = !!expandedFolders[folder.id];
                        return (
                          <div key={folder.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                            {/* Folder Title Bar */}
                            <div 
                              className="p-3 bg-slate-50 hover:bg-slate-100/80 cursor-pointer flex items-center justify-between transition-colors border-b border-slate-100"
                              onClick={() => toggleFolderExpand(folder.id)}
                            >
                              <div className="flex items-center gap-2.5">
                                {isExpanded ? <FolderOpen className="w-4 h-4 text-amber-500 fill-amber-100" /> : <Folder className="w-4 h-4 text-amber-500 fill-amber-100" />}
                                <span className="font-semibold text-slate-800 text-sm">{folder.name}</span>
                                <Badge variant="outline" className="text-[11px] font-normal text-slate-600 bg-white">
                                  {folder.docs.length} {folder.docs.length === 1 ? 'document' : 'documents'}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 text-slate-400">
                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </div>
                            </div>

                            {/* Documents inside Folder */}
                            {isExpanded && (
                              <div className="divide-y divide-slate-100">
                                {folder.docs.length === 0 ? (
                                  <div className="p-3 text-center text-xs text-slate-400 italic">
                                    No documents stored in this folder yet.
                                  </div>
                                ) : (
                                  folder.docs.map(doc => (
                                    <div key={doc.id} className="p-3.5 space-y-2 hover:bg-slate-50/80 transition-colors">
                                      {/* Document Main Info */}
                                      <div className="flex items-center justify-between flex-wrap gap-2">
                                          <div className="flex items-center gap-2.5">
                                            <Checkbox 
                                              checked={selectedDocIds.includes(doc.id)}
                                              onCheckedChange={() => {
                                                setSelectedDocIds(prev => prev.includes(doc.id) ? prev.filter(i => i !== doc.id) : [...prev, doc.id])
                                              }}
                                              aria-label="Select document"
                                            />
                                            <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                                            <div>
                                            <span className="font-bold text-indigo-600 text-sm">{doc.document_number}</span>
                                            <span className="text-slate-800 text-sm font-medium ml-2">— {doc.document_name}</span>
                                            {doc.part_number && <span className="text-xs text-slate-500 ml-2">(PN: {doc.part_number})</span>}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Badge variant={doc.status === "Approved" || doc.status === "Released" ? "default" : "outline"} className="text-xs">
                                            {doc.status}
                                          </Badge>
                                          <Button size="sm" variant="ghost" className="h-7 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-2" onClick={() => navigate({ to: `/documents/${doc.id}` })}>
                                            <Info className="w-3.5 h-3.5 mr-1" /> View Details
                                          </Button>
                                        </div>
                                      </div>

                                      {/* Version Files inside Document */}
                                      {doc.versions && doc.versions.length > 0 && (
                                        <div className="ml-6 pt-1 space-y-1 border-l-2 border-indigo-100 pl-3">
                                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                            Google Drive Files & Revisions ({doc.versions.length}):
                                          </p>
                                          {doc.versions.sort((a: any, b: any) => b.version_number - a.version_number).map((ver: any) => (
                                            <div key={ver.id} className="flex items-center justify-between py-1.5 px-3 bg-slate-50 rounded border border-slate-200/80 text-xs hover:border-indigo-200 transition-colors">
                                              <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-white font-mono text-indigo-700 border-indigo-200">
                                                  V{ver.version_number}
                                                </Badge>
                                                <span className="font-semibold text-slate-800">{ver.file_name}</span>
                                                <span className="text-slate-400 text-[11px]">({ver.file_type?.toUpperCase()})</span>
                                                <span className="text-slate-400 text-[11px]">• Uploaded by {ver.uploaded_by_name || 'User'}</span>
                                              </div>

                                              <div className="flex items-center gap-1">
                                                {ver.google_drive_file_id && can("view") && (
                                                  <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50" onClick={() => handlePreview(ver.google_drive_file_id, doc.id)}>
                                                    <Eye className="w-3 h-3 mr-1" /> Preview
                                                  </Button>
                                                )}
                                                {ver.google_drive_file_id && can("download") && (
                                                  <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2 text-slate-700 hover:bg-slate-200" onClick={() => handleDownload(ver.google_drive_file_id, doc.id, ver.file_name)}>
                                                    <Download className="w-3 h-3 mr-1" /> Download
                                                  </Button>
                                                )}
                                                {ver.google_drive_file_id && (
                                                  <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50" onClick={() => handleOpenLocally(doc, ver)}>
                                                    <Laptop className="w-3 h-3 mr-1" /> Open Locally
                                                  </Button>
                                                )}
                                                {ver.google_drive_file_id && (
                                                  <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => window.open(`https://drive.google.com/file/d/${ver.google_drive_file_id}/view`, '_blank')}>
                                                    <ExternalLink className="w-3 h-3 mr-1" /> Open in Drive
                                                  </Button>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="w-[40px] pl-4">
                  <Checkbox 
                    checked={selectedDocIds.length > 0 && selectedDocIds.length === filteredRows.length}
                    onCheckedChange={(checked) => {
                      if (checked) setSelectedDocIds(filteredRows.map(r => r.id));
                      else setSelectedDocIds([]);
                    }}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Part / Name</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                    Loading documents...
                  </TableCell>
                </TableRow>
              ) : !data || filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <FileText className="w-8 h-8 text-slate-300 mb-2" />
                      <p>No documents found matching your criteria.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                  filteredRows.map((doc) => (
                    <DocumentRow 
                      key={doc.id} 
                      doc={doc} 
                      can={can} 
                      navigate={navigate} 
                      onPreview={handlePreview} 
                      onDownload={handleDownload} 
                      onOpenLocally={handleOpenLocally}
                      isSelected={selectedDocIds.includes(doc.id)}
                      onSelect={(id) => {
                        setSelectedDocIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
                      }}
                    />
                  ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {data && data.total > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, data.total)} of {data.total} documents
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * pageSize >= data.total}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
