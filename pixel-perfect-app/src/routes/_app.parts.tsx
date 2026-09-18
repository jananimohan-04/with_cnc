import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { 
  createPart, 
  listParts, 
  listParties, 
  listDocuments,
  createDocument, 
  updateDocument, 
  createVersion, 
  supersedeOlderVersions, 
  findDocumentByNumber, 
  logAudit, 
  createNotification,
  PartWithDetails 
} from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { 
  Box, 
  Plus, 
  Search, 
  FilterX, 
  MoreHorizontal, 
  FileText, 
  Info, 
  UploadCloud, 
  ChevronDown, 
  ChevronRight, 
  Eye, 
  Download, 
  Folder, 
  CheckCircle2, 
  Paperclip, 
  Layers, 
  Loader2,
  FileCheck,
  ExternalLink,
  Laptop,
  CheckSquare
} from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { GoogleDriveService } from "@/services/google-drive";
import { DOC_STATUSES, DOCUMENT_TYPES, ALLOWED_EXTENSIONS, MAX_FILE_SIZE, formatBytes, DocStatus } from "@/lib/rbac";

export const Route = createFileRoute("/_app/parts")({
  component: PartsPage,
});

/* -------------------------------------------------------------------------- */
/*                     Upload Document for an Existing Part                    */
/* -------------------------------------------------------------------------- */

function UploadToPartDialog({ 
  part, 
  open, 
  onOpenChange, 
  onSuccess 
}: { 
  part: PartWithDetails | null; 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  onSuccess: () => void;
}) {
  const { profile, user } = useAuth();
  const { userPartyId } = usePermissions();
  const userId = user?.id;
  const userName = profile?.full_name || user?.email || "Admin";

  const [file, setFile] = useState<File | null>(null);
  const [docNumber, setDocNumber] = useState("");
  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState("2D Drawing");
  const [drawingNumber, setDrawingNumber] = useState("");
  const [folderId, setFolderId] = useState("root");
  const [status, setStatus] = useState<string>("Draft");
  const [revisionNotes, setRevisionNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Sync state with part when dialog opens
  const effectiveDocPartyId = part?.party_id || userPartyId || "internal";

  const { data: partyFolders } = useQuery({
    queryKey: ["drive_folders", effectiveDocPartyId],
    queryFn: () => GoogleDriveService.listFolders(effectiveDocPartyId),
    enabled: open && !!part && effectiveDocPartyId !== "internal",
  });

  const handleFileChange = (selectedFile: File | null) => {
    setFile(selectedFile);
    if (selectedFile) {
      const fileNameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, "");
      if (!docName && part?.part_name) setDocName(part.part_name);
      else if (!docName) setDocName(fileNameWithoutExt);
      
      if (!docNumber && part?.part_number) setDocNumber(part.part_number);
      if (!drawingNumber && part?.drawing_number) setDrawingNumber(part.drawing_number);
    }
  };

  const handleUpload = async () => {
    if (!part) return;
    if (!file) return toast.error("Please select a file to upload.");
    if (!docNumber.trim()) return toast.error("Document Number is required.");
    if (!docName.trim()) return toast.error("Document Name is required.");
    if (!userId) return toast.error("User session missing.");

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext as any)) {
      return toast.error(`Unsupported file type: .${ext}`);
    }
    if (file.size > MAX_FILE_SIZE) {
      return toast.error("File exceeds maximum allowed size (50MB).");
    }

    setUploading(true);
    setUploadProgress(15);

    const interval = setInterval(() => {
      setUploadProgress(p => (p >= 85 ? 85 : p + 15));
    }, 400);

    try {
      // 1. Check existing document with this document number
      const existingDoc = await findDocumentByNumber(docNumber.trim());
      const nextVersion = existingDoc ? existingDoc.current_version + 1 : 1;

      // 2. Upload file to Google Drive
      const driveUpload = await GoogleDriveService.uploadFile(file, {
        partyId: part.party_id || userPartyId || "internal",
        documentNumber: docNumber.trim(),
        version: nextVersion,
        targetFolderId: folderId === "root" ? undefined : folderId,
      });

      const googleDriveFileId = driveUpload.fileId;

      // 3. Create or update Document record in DB
      let finalDocId = existingDoc?.id;
      if (existingDoc) {
        await updateDocument(existingDoc.id, {
          part_id: part.id,
          part_number: part.part_number,
          document_name: docName.trim(),
          drawing_number: drawingNumber.trim() || null,
          document_type: docType,
          current_version: nextVersion,
          status: status as DocStatus,
          updated_by: userId,
          updated_by_name: userName,
          drive_folder_id: folderId === "root" ? null : folderId,
        });
      } else {
        const targetParty = part.party_id || userPartyId || undefined;
        const newDoc = await createDocument({
          party_id: targetParty,
          part_id: part.id,
          document_number: docNumber.trim(),
          document_name: docName.trim(),
          drawing_number: drawingNumber.trim() || null,
          part_number: part.part_number,
          document_type: docType,
          current_version: 1,
          status: status as DocStatus,
          file_type: ext,
          created_by: userId,
          created_by_name: userName,
          updated_by: userId,
          updated_by_name: userName,
          drive_folder_id: folderId === "root" ? null : folderId,
        });
        finalDocId = newDoc.id;
      }

      // 4. Create Version record in DB
      await createVersion({
        document_id: finalDocId,
        version_number: nextVersion,
        file_name: file.name,
        file_type: ext,
        file_size: file.size,
        google_drive_file_id: googleDriveFileId,
        status: status as DocStatus,
        revision_notes: revisionNotes.trim() || `Uploaded for Part ${part.part_number}`,
        uploaded_by: userId,
        uploaded_by_name: userName,
      });

      if (nextVersion > 1) {
        await supersedeOlderVersions(finalDocId, nextVersion);
      }

      // 5. Audit log & notification
      await logAudit({
        user_id: userId,
        user_name: userName,
        action: existingDoc ? "NEW_VERSION" : "UPLOAD",
        document_id: finalDocId,
        document_number: docNumber.trim(),
        version_number: nextVersion,
        details: `Uploaded document for Part ${part.part_number} (${file.name})`,
      });

      await createNotification({
        user_id: userId,
        title: existingDoc ? "New Version Uploaded" : "Document Attached to Part",
        body: `${docNumber.trim()} (V${nextVersion}) was uploaded for Part ${part.part_number}.`,
        type: "NEW_VERSION",
        document_id: finalDocId,
      });

      clearInterval(interval);
      setUploadProgress(100);
      toast.success(`Document uploaded successfully for Part ${part.part_number}!`);
      
      // Reset & close
      setFile(null);
      setRevisionNotes("");
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      clearInterval(interval);
      toast.error(err.message || "Failed to upload document");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <UploadCloud className="w-5 h-5 text-indigo-600" />
            Upload Document for Part: <span className="text-indigo-600 font-mono">{part?.part_number}</span>
          </DialogTitle>
          <DialogDescription>
            Directly upload engineering drawings, CAD models, or programs associated with this part.
          </DialogDescription>
        </DialogHeader>

        {part && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs flex items-center justify-between text-slate-600">
            <div>
              <span className="font-semibold text-slate-800">Part: </span>
              {part.part_name || part.part_number}
            </div>
            <div>
              <span className="font-semibold text-slate-800">Party: </span>
              {part.parties?.name || "Internal"}
            </div>
            {part.drawing_number && (
              <div>
                <span className="font-semibold text-slate-800">DRG: </span>
                {part.drawing_number}
              </div>
            )}
          </div>
        )}

        <div className="space-y-4 py-2">
          {/* File Picker */}
          <div className="space-y-1.5">
            <Label className="font-semibold">Select File *</Label>
            <div className="border-2 border-dashed border-slate-200 hover:border-indigo-300 transition-colors rounded-lg p-4 text-center bg-slate-50/50">
              <input 
                type="file" 
                id="upload-part-file"
                className="hidden" 
                onChange={(e) => handleFileChange(e.target.files?.[0] || null)} 
              />
              <label htmlFor="upload-part-file" className="cursor-pointer block">
                <UploadCloud className="w-8 h-8 text-indigo-500 mx-auto mb-1.5" />
                {file ? (
                  <div className="space-y-0.5">
                    <p className="font-semibold text-slate-800 text-sm">{file.name}</p>
                    <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
                    <Badge variant="outline" className="text-[10px] text-green-700 bg-green-50 border-green-200 mt-1">
                      Ready to Upload
                    </Badge>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-slate-700">Click to browse file</p>
                    <p className="text-xs text-slate-400 mt-0.5">PDF, DXF, DWG, STEP, NC, ZIP (up to 50MB)</p>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* Doc metadata */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Document Number *</Label>
              <Input 
                value={docNumber} 
                onChange={e => setDocNumber(e.target.value)} 
                placeholder={part?.part_number || "DOC-1001"} 
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Document Name *</Label>
              <Input 
                value={docName} 
                onChange={e => setDocName(e.target.value)} 
                placeholder={part?.part_name || "Manufacturing Drawing"} 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Document Type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Drawing Number (Optional)</Label>
              <Input 
                value={drawingNumber} 
                onChange={e => setDrawingNumber(e.target.value)} 
                placeholder="DRG-001" 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Target Drive Folder</Label>
              <Select value={folderId} onValueChange={setFolderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Folder" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="root">CNC Vault (Root)</SelectItem>
                  {partyFolders?.map(f => (
                    <SelectItem key={f.id} value={f.google_folder_id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Initial Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {DOC_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Revision Notes</Label>
            <Textarea 
              value={revisionNotes} 
              onChange={e => setRevisionNotes(e.target.value)} 
              placeholder="e.g. Initial engineering drawing release"
              rows={2}
            />
          </div>

          {uploading && (
            <div className="space-y-1.5 bg-indigo-50 border border-indigo-100 rounded-lg p-3">
              <div className="flex justify-between text-xs font-semibold text-indigo-700">
                <span>Uploading directly to Google Drive...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-indigo-200 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-indigo-600 h-full transition-all duration-300 ease-out" 
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={uploading || !file} className="bg-indigo-600 hover:bg-indigo-700">
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <UploadCloud className="w-4 h-4 mr-2" />
                Upload Document
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*               Create Part Dialog (With Integrated File Upload)              */
/* -------------------------------------------------------------------------- */

function AddPartDialog({ onAdded }: { onAdded: () => void }) {
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();
  const { userPartyId } = usePermissions();
  const userId = user?.id;
  const userName = profile?.full_name || user?.email || "Admin";

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Part details
  const [partNumber, setPartNumber] = useState("");
  const [partName, setPartName] = useState("");
  const [drawingNumber, setDrawingNumber] = useState("");
  const [partyId, setPartyId] = useState(userPartyId || "");

  // Integrated Document Upload options
  const [attachDocument, setAttachDocument] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [docNumber, setDocNumber] = useState("");
  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState("2D Drawing");
  const [folderId, setFolderId] = useState("root");
  const [status, setStatus] = useState<string>("Draft");
  const [revisionNotes, setRevisionNotes] = useState("");

  const effectivePartyForFolders = partyId || userPartyId || "internal";

  const { data: parties } = useQuery({
    queryKey: ["parties-list-for-parts"],
    queryFn: listParties,
  });

  const { data: partyFolders } = useQuery({
    queryKey: ["drive_folders", effectivePartyForFolders],
    queryFn: () => GoogleDriveService.listFolders(effectivePartyForFolders),
    enabled: open && attachDocument && !!effectivePartyForFolders && effectivePartyForFolders !== "internal",
  });

  const handleFileChange = (selectedFile: File | null) => {
    setFile(selectedFile);
    if (selectedFile) {
      const fileNameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, "");
      if (!docNumber && partNumber) setDocNumber(partNumber);
      if (!docName && partName) setDocName(partName);
      else if (!docName) setDocName(fileNameWithoutExt);
    }
  };

  const handleSave = async () => {
    if (!partNumber.trim() || !partName.trim()) {
      return toast.error("Part Number and Name are required.");
    }

    setLoading(true);
    setUploadProgress(15);

    try {
      const effectiveParty = (partyId && partyId !== "internal") ? partyId : (userPartyId || null);

      // 1. Create the Part
      const newPart = await createPart({
        part_number: partNumber.trim(),
        part_name: partName.trim(),
        drawing_number: drawingNumber.trim() || null,
        party_id: effectiveParty,
      });

      // 2. If user wants to attach document & selected file
      if (attachDocument && file) {
        if (!userId) throw new Error("User session missing.");

        const ext = file.name.split('.').pop()?.toLowerCase();
        if (!ext || !ALLOWED_EXTENSIONS.includes(ext as any)) {
          throw new Error(`Unsupported file type: .${ext}`);
        }
        if (file.size > MAX_FILE_SIZE) {
          throw new Error("File exceeds maximum size (50MB).");
        }

        const effectiveDocNumber = docNumber.trim() || partNumber.trim();
        const effectiveDocName = docName.trim() || partName.trim();

        // Upload to Google Drive
        const driveUpload = await GoogleDriveService.uploadFile(file, {
          partyId: effectiveParty || "internal",
          documentNumber: effectiveDocNumber,
          version: 1,
          targetFolderId: folderId === "root" ? undefined : folderId,
        });

        // Create Document
        const newDoc = await createDocument({
          party_id: effectiveParty || undefined,
          part_id: newPart.id,
          document_number: effectiveDocNumber,
          document_name: effectiveDocName,
          drawing_number: drawingNumber.trim() || null,
          part_number: partNumber.trim(),
          document_type: docType,
          current_version: 1,
          status: status as DocStatus,
          file_type: ext,
          created_by: userId,
          created_by_name: userName,
          updated_by: userId,
          updated_by_name: userName,
          drive_folder_id: folderId === "root" ? null : folderId,
        });

        // Create Version
        await createVersion({
          document_id: newDoc.id,
          version_number: 1,
          file_name: file.name,
          file_type: ext,
          file_size: file.size,
          google_drive_file_id: driveUpload.fileId,
          status: status as DocStatus,
          revision_notes: revisionNotes.trim() || "Initial upload with part",
          uploaded_by: userId,
          uploaded_by_name: userName,
        });

        // Audit Log
        await logAudit({
          user_id: userId,
          user_name: userName,
          action: "UPLOAD",
          document_id: newDoc.id,
          document_number: effectiveDocNumber,
          version_number: 1,
          details: `Created Part ${partNumber} and uploaded initial document ${effectiveDocNumber}`,
        });

        toast.success(`Part ${partNumber} and document uploaded successfully!`);
      } else {
        toast.success(`Part ${partNumber} created successfully!`);
      }

      setOpen(false);
      onAdded();

      // Reset form
      setPartNumber("");
      setPartName("");
      setDrawingNumber("");
      setPartyId("");
      setAttachDocument(false);
      setFile(null);
      setDocNumber("");
      setDocName("");
      setRevisionNotes("");
    } catch (err: any) {
      toast.error(err.message || "Failed to create part");
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-sm">
          <Plus className="w-4 h-4 mr-2" />
          Add Part & Drawing
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <Box className="w-5 h-5 text-indigo-600" />
            Add New Part & Document
          </DialogTitle>
          <DialogDescription>
            Register a manufactured part and immediately attach its engineering drawing or document.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-3">
          {/* Part Details */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              1. Part Information
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Part Number *</Label>
                <Input 
                  value={partNumber} 
                  onChange={e => {
                    setPartNumber(e.target.value);
                    if (!docNumber) setDocNumber(e.target.value);
                  }} 
                  placeholder="e.g. CNC-1001" 
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Part Name *</Label>
                <Input 
                  value={partName} 
                  onChange={e => {
                    setPartName(e.target.value);
                    if (!docName) setDocName(e.target.value);
                  }} 
                  placeholder="e.g. Flange Adapter" 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Drawing Number (Optional)</Label>
                <Input 
                  value={drawingNumber} 
                  onChange={e => setDrawingNumber(e.target.value)} 
                  placeholder="e.g. DRG-1001" 
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Company / Party (Optional)</Label>
                <Select value={partyId} onValueChange={setPartyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Party / Customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Internal Company</SelectItem>
                    {parties?.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Toggle: Also attach document right now */}
          <div className="pt-3 border-t border-slate-200">
            <div className="flex items-center justify-between p-3 bg-indigo-50/70 border border-indigo-100 rounded-lg">
              <div className="flex items-center gap-2.5">
                <UploadCloud className="w-5 h-5 text-indigo-600" />
                <div>
                  <div className="text-sm font-semibold text-slate-800">
                    Attach Drawing / Document File Now
                  </div>
                  <div className="text-xs text-slate-500">
                    Upload the engineering file directly to Google Drive while creating this part
                  </div>
                </div>
              </div>
              <Switch 
                checked={attachDocument} 
                onCheckedChange={setAttachDocument} 
              />
            </div>

            {attachDocument && (
              <div className="mt-4 p-4 border border-slate-200 rounded-lg bg-slate-50/50 space-y-4 animate-in fade-in duration-300">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  2. Document Details & File Upload
                </div>

                {/* File picker */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Document / Drawing File *</Label>
                  <div className="border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-white rounded-lg p-4 text-center cursor-pointer transition-colors">
                    <input 
                      type="file" 
                      id="part-file-input"
                      className="hidden" 
                      onChange={e => handleFileChange(e.target.files?.[0] || null)} 
                    />
                    <label htmlFor="part-file-input" className="cursor-pointer block">
                      <Paperclip className="w-6 h-6 text-indigo-500 mx-auto mb-1.5" />
                      {file ? (
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{file.name}</p>
                          <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
                        </div>
                      ) : (
                        <div>
                          <span className="text-sm font-medium text-slate-700">Click to select drawing file</span>
                          <p className="text-xs text-slate-400">PDF, DXF, DWG, STEP, NC, ZIP</p>
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Document Number</Label>
                    <Input 
                      value={docNumber} 
                      onChange={e => setDocNumber(e.target.value)} 
                      placeholder={partNumber || "DOC-1001"} 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Document Name</Label>
                    <Input 
                      value={docName} 
                      onChange={e => setDocName(e.target.value)} 
                      placeholder={partName || "Drawing"} 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Document Type</Label>
                    <Select value={docType} onValueChange={setDocType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPES.map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Drive Folder</Label>
                    <Select value={folderId} onValueChange={setFolderId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Folder" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="root">CNC Vault (Root)</SelectItem>
                        {partyFolders?.map(f => (
                          <SelectItem key={f.id} value={f.google_folder_id}>{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Initial Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger>
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        {DOC_STATUSES.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Revision Notes</Label>
                    <Input 
                      value={revisionNotes} 
                      onChange={e => setRevisionNotes(e.target.value)} 
                      placeholder="e.g. Initial engineering release" 
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {attachDocument && file ? "Creating & Uploading..." : "Saving..."}
              </>
            ) : attachDocument && file ? (
              <>
                <UploadCloud className="w-4 h-4 mr-2" />
                Create Part & Upload Document
              </>
            ) : (
              "Save Part"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Main Parts Page                              */
/* -------------------------------------------------------------------------- */

function PartsPage() {
  const { user } = useAuth();
  const { can, isSuperAdmin, isCompanyAdmin, isNormalUser, userPartyId, profile } = usePermissions();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [partyId, setPartyId] = useState<string>("all");
  const [docType, setDocType] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [showBatchShareDialog, setShowBatchShareDialog] = useState(false);
  const [batchShareEmail, setBatchShareEmail] = useState("");
  const [isBatchSharing, setIsBatchSharing] = useState(false);
  const [sharedEmails, setSharedEmails] = useState<string[]>([]);
  const [isLoadingSharedEmails, setIsLoadingSharedEmails] = useState(false);

  const fetchSharedEmails = async () => {
    const allDocs = [...(documentsData?.rows || []), ...(fallbackDocsData?.rows || [])];
    const selectedDocsData = allDocs.filter(d => selectedDocIds.includes(d.id));
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
    const allDocs = [...(documentsData?.rows || []), ...(fallbackDocsData?.rows || [])];
    const selectedDocsData = allDocs.filter(d => selectedDocIds.includes(d.id));
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
    // Find the file IDs from all fetched documents
    const allDocs = [...(documentsData?.rows || []), ...(fallbackDocsData?.rows || [])];
    const selectedDocsData = allDocs.filter(d => selectedDocIds.includes(d.id));

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

  // Auto-sync Google Drive
  useEffect(() => {
    const targetPartyId = userPartyId || (partyId !== "all" ? partyId : undefined);
    if (!targetPartyId) return;

    const lastSyncStr = sessionStorage.getItem(`last_drive_sync_${targetPartyId}`);
    const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;
    
    if (Date.now() - lastSync > 60000) {
      sessionStorage.setItem(`last_drive_sync_${targetPartyId}`, Date.now().toString());
      GoogleDriveService.syncVersions(targetPartyId).then(res => {
        if (res.synced > 0) {
          toast.success(`Auto-synced: Found ${res.synced} updated file(s) from Drive.`);
          queryClient.invalidateQueries({ queryKey: ["documents"] });
          queryClient.invalidateQueries({ queryKey: ["parts"] });
        }
      }).catch(() => {});
    }
  }, [userPartyId, partyId, queryClient]);

  const [expandedParts, setExpandedParts] = useState<Record<string, boolean>>({});

  // Dialog state for uploading directly to an existing part
  const [selectedPartForUpload, setSelectedPartForUpload] = useState<PartWithDetails | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  const effectivePartyId = isSuperAdmin ? (partyId !== "all" ? partyId : undefined) : (userPartyId || undefined);

  const { data: parties } = useQuery({
    queryKey: ["parties-list"],
    queryFn: listParties,
  });

  const { data: parts, isLoading, refetch } = useQuery({
    queryKey: ["parts-list", effectivePartyId],
    queryFn: () => listParts(effectivePartyId),
  });

  const { data: documentsData, refetch: refetchDocs } = useQuery({
    queryKey: ["parts-page-documents", effectivePartyId],
    queryFn: () => listDocuments({ partyId: effectivePartyId, pageSize: 200 }),
  });

  const { data: fallbackDocsData } = useQuery({
    queryKey: ["parts-page-fallback-docs"],
    queryFn: () => listDocuments({ pageSize: 200 }),
  });

  const handleSuccessRefresh = () => {
    refetch();
    refetchDocs();
    queryClient.invalidateQueries({ queryKey: ["parts-list"] });
    queryClient.invalidateQueries({ queryKey: ["parts-page-documents"] });
    queryClient.invalidateQueries({ queryKey: ["parts-page-fallback-docs"] });
    queryClient.invalidateQueries({ queryKey: ["documents"] });
  };

  const allAvailableDocs = useMemo(() => {
    const list = [...(documentsData?.rows || [])];
    (fallbackDocsData?.rows || []).forEach(d => {
      if (!list.some(existing => existing.id === d.id)) list.push(d);
    });
    return list;
  }, [documentsData, fallbackDocsData]);

  const getDocsForPart = (part: PartWithDetails) => {
    const pNum = part.part_number.trim().toLowerCase();
    const drgNum = part.drawing_number?.trim().toLowerCase() || "";

    const matched = allAvailableDocs.filter(doc => {
      if (doc.part_id && doc.part_id === part.id) return true;

      const docPartNum = doc.part_number?.trim().toLowerCase();
      const docNum = doc.document_number?.trim().toLowerCase();
      const docDrg = doc.drawing_number?.trim().toLowerCase();

      // Match by part_number
      if (docPartNum && docPartNum === pNum) return true;
      // Match if document_number is the part number
      if (docNum && docNum === pNum) return true;
      // Match by drawing number
      if (drgNum && docDrg && docDrg === drgNum) return true;
      if (drgNum && docNum && docNum === drgNum) return true;

      return false;
    });

    // Auto-heal missing part_id in background
    matched.forEach(doc => {
      if (!doc.part_id) {
        updateDocument(doc.id, { part_id: part.id, part_number: part.part_number }).catch(() => {});
      }
    });

    if (matched.length > 0) return matched;
    return part.documents || [];
  };

  const toggleExpand = (id: string) => {
    setExpandedParts(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleOpenUploadForPart = (part: PartWithDetails) => {
    setSelectedPartForUpload(part);
    setUploadDialogOpen(true);
  };

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

  const filteredParts = parts?.filter(p => 
    !search || 
    p.part_number.toLowerCase().includes(search.toLowerCase()) || 
    (p.part_name && p.part_name.toLowerCase().includes(search.toLowerCase())) ||
    (p.drawing_number && p.drawing_number.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Parts & Drawings</h2>
          <p className="text-muted-foreground mt-1">
            Create engineering parts and directly upload or manage their documents.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {can("upload") && (
            <AddPartDialog onAdded={handleSuccessRefresh} />
          )}
        </div>
      </div>

      {/* Batch Share Bar */}
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
                    Grant an external user read access to the selected documents in Google Drive.
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

      {/* Search & Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Search parts by number, name, drawing..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full md:w-auto">
          {isSuperAdmin ? (
            <Select value={partyId} onValueChange={setPartyId}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Party" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Parties</SelectItem>
                {parties?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-md text-xs font-semibold text-indigo-800">
              <span className="truncate">{parties?.find(p => p.id === userPartyId)?.name || "My Company"}</span>
            </div>
          )}

          <Button variant="outline" onClick={() => { setSearch(""); setPartyId("all"); }} className="w-full">
            <FilterX className="w-4 h-4 mr-2" />
            Reset
          </Button>
        </div>
      </div>

      {/* Parts Table */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Part Number / Name</TableHead>
              <TableHead>Drawing Number</TableHead>
              <TableHead>Party</TableHead>
              <TableHead>Attached Documents</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                  Loading parts and drawings...
                </TableCell>
              </TableRow>
            ) : !filteredParts || filteredParts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center">
                    <Box className="w-8 h-8 text-slate-300 mb-2" />
                    <p>No parts found.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredParts.map((part) => {
                const isExpanded = !!expandedParts[part.id];
                const partDocs = getDocsForPart(part);

                return (
                  <Fragment key={part.id}>
                    <TableRow className="hover:bg-slate-50 transition-colors">
                      {/* Expand Toggle */}
                      <TableCell className="pr-0">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0 text-slate-500" 
                          onClick={() => toggleExpand(part.id)}
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-indigo-600" /> : <ChevronRight className="w-4 h-4" />}
                        </Button>
                      </TableCell>

                      {/* Part Number & Name */}
                      <TableCell>
                        <div className="font-bold text-indigo-600 flex items-center gap-1.5">
                          <Box className="w-4 h-4 text-slate-400 shrink-0" />
                          <span>{part.part_number}</span>
                        </div>
                        <div className="text-xs text-slate-500 truncate max-w-[220px] ml-5">
                          {part.part_name || "—"}
                        </div>
                      </TableCell>

                      {/* Drawing Number */}
                      <TableCell>
                        <div className="text-sm font-medium text-slate-800">
                          {part.drawing_number || "—"}
                        </div>
                        {part.drawing_type && (
                          <div className="text-xs text-slate-500">{part.drawing_type}</div>
                        )}
                      </TableCell>

                      {/* Party */}
                      <TableCell className="text-sm text-slate-700">
                        {part.parties?.name || "Internal"}
                      </TableCell>

                      {/* Documents count */}
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 text-xs px-2 font-medium text-slate-700 hover:text-indigo-600 hover:bg-indigo-50"
                          onClick={() => toggleExpand(part.id)}
                        >
                          <FileText className="w-3.5 h-3.5 mr-1.5 text-indigo-500" />
                          {partDocs.length} {partDocs.length === 1 ? "document" : "documents"}
                        </Button>
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Badge variant={part.status === "Active" ? "default" : "secondary"} className="text-xs">
                          {part.status}
                        </Badge>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right space-x-1">
                        {can("upload") && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-8 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800"
                            onClick={() => handleOpenUploadForPart(part)}
                          >
                            <UploadCloud className="w-3.5 h-3.5 mr-1" />
                            Upload Doc
                          </Button>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0 text-slate-500">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {can("upload") && (
                              <DropdownMenuItem onClick={() => handleOpenUploadForPart(part)}>
                                <UploadCloud className="mr-2 h-4 w-4 text-indigo-600" /> Upload Document
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => toggleExpand(part.id)}>
                              <Layers className="mr-2 h-4 w-4 text-slate-500" /> 
                              {isExpanded ? "Hide Documents" : "View Documents"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => navigate({ to: '/documents' })}>
                              <FileText className="mr-2 h-4 w-4 text-slate-500" /> All Documents Page
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>

                    {/* Expanded row showing documents directly under the part */}
                    {isExpanded && (
                      <TableRow className="bg-slate-50/70 hover:bg-slate-50/90 border-b border-slate-200">
                        <TableCell colSpan={7} className="p-4 pl-12">
                          <div className="space-y-3 bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-indigo-600" />
                                <span className="font-bold text-sm text-slate-800">
                                  Documents & Drawings for {part.part_number}
                                </span>
                                <Badge variant="outline" className="text-xs bg-slate-50">
                                  {partDocs.length} {partDocs.length === 1 ? "file" : "files"}
                                </Badge>
                              </div>

                              <div className="flex items-center gap-1">
                                {partDocs.length > 0 && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 mr-1"
                                    onClick={() => {
                                      const allDocsSelected = partDocs.every((d: any) => selectedDocIds.includes(d.id));
                                      if (allDocsSelected) {
                                        setSelectedDocIds(prev => prev.filter(id => !partDocs.some((d: any) => d.id === id)));
                                      } else {
                                        setSelectedDocIds(prev => [...new Set([...prev, ...partDocs.map((d: any) => d.id)])]);
                                      }
                                    }}
                                  >
                                    <CheckSquare className="w-3.5 h-3.5 mr-1" />
                                    {partDocs.every((d: any) => selectedDocIds.includes(d.id)) ? "Deselect All" : "Select All"}
                                  </Button>
                                )}
                                
                                {can("upload") && (
                                  <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    className="h-7 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                    onClick={() => handleOpenUploadForPart(part)}
                                  >
                                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Document to this Part
                                  </Button>
                                )}
                              </div>
                            </div>

                            {partDocs.length === 0 ? (
                              <div className="text-center py-6 border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
                                <FileText className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
                                <p className="text-xs text-slate-500">No documents or drawings uploaded for this part yet.</p>
                                {can("upload") && (
                                  <Button 
                                    size="sm" 
                                    variant="link" 
                                    className="text-xs text-indigo-600 mt-1" 
                                    onClick={() => handleOpenUploadForPart(part)}
                                  >
                                    + Upload document now
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <div className="divide-y divide-slate-100 border border-slate-100 rounded-md">
                                {partDocs.map((doc: any) => {
                                  const latestVer = doc.versions?.[0];

                                  return (
                                    <div key={doc.id} className="p-3 flex items-center justify-between hover:bg-slate-50/60 transition-colors">
                                      <div className="flex items-center gap-3">
                                        <Checkbox 
                                          checked={selectedDocIds.includes(doc.id)}
                                          onCheckedChange={() => {
                                            setSelectedDocIds(prev => prev.includes(doc.id) ? prev.filter(i => i !== doc.id) : [...prev, doc.id])
                                          }}
                                          aria-label="Select document"
                                        />
                                        <div className="w-8 h-8 rounded bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                                          <FileText className="w-4 h-4 text-indigo-600" />
                                        </div>
                                        <div>
                                          <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm text-indigo-600">{doc.document_number}</span>
                                            <span className="text-slate-800 text-sm font-medium">— {doc.document_name}</span>
                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-white font-mono text-indigo-700 border-indigo-200">
                                              V{doc.current_version}
                                            </Badge>
                                          </div>
                                          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                                            <span>Type: {doc.document_type || "Drawing"}</span>
                                            <span>•</span>
                                            <span>Updated {format(new Date(doc.updated_at), "MMM d, yyyy")}</span>
                                            {doc.drawing_number && (
                                              <>
                                                <span>•</span>
                                                <span>DRG: {doc.drawing_number}</span>
                                              </>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <Badge variant={doc.status === "Approved" || doc.status === "Released" ? "default" : "outline"} className="text-xs">
                                          {doc.status}
                                        </Badge>

                                        {latestVer?.google_drive_file_id && can("view") && (
                                          <Button 
                                            size="sm" 
                                            variant="ghost" 
                                            className="h-7 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-2"
                                            onClick={() => handlePreview(latestVer.google_drive_file_id, doc.id)}
                                          >
                                            <Eye className="w-3.5 h-3.5 mr-1" /> Preview
                                          </Button>
                                        )}

                                        {latestVer?.google_drive_file_id && can("download") && (
                                          <Button 
                                            size="sm" 
                                            variant="ghost" 
                                            className="h-7 text-xs text-slate-700 hover:bg-slate-200 px-2"
                                            onClick={() => handleDownload(latestVer.google_drive_file_id, doc.id, latestVer.file_name)}
                                          >
                                            <Download className="w-3.5 h-3.5 mr-1" /> Download
                                          </Button>
                                        )}

                                        {latestVer?.google_drive_file_id && (
                                          <>
                                            <Button 
                                              size="sm" 
                                              variant="ghost" 
                                              className="h-7 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-2"
                                              onClick={() => handleOpenLocally(doc, latestVer)}
                                            >
                                              <Laptop className="w-3.5 h-3.5 mr-1" /> Open Locally
                                            </Button>
                                            <Button 
                                              size="sm" 
                                              variant="ghost" 
                                              className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-2"
                                              onClick={() => window.open(`https://drive.google.com/file/d/${latestVer.google_drive_file_id}/view`, '_blank')}
                                            >
                                              <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open in Drive
                                            </Button>
                                          </>
                                        )}

                                        <Button 
                                          size="sm" 
                                          variant="ghost" 
                                          className="h-7 text-xs text-slate-500 hover:text-slate-800 px-2"
                                          onClick={() => navigate({ to: `/documents/${doc.id}` })}
                                        >
                                          <Info className="w-3.5 h-3.5 mr-1" /> Details
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Upload Dialog when opened from a specific Part */}
      <UploadToPartDialog 
        part={selectedPartForUpload} 
        open={uploadDialogOpen} 
        onOpenChange={setUploadDialogOpen} 
        onSuccess={handleSuccessRefresh} 
      />
    </div>
  );
}
