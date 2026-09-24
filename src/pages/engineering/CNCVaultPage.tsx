import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  FileText, Plus, Search, Eye, Edit, Trash2, UploadCloud, Download, 
  Layers, Boxes, CheckCircle2, Clock, History, Paperclip, ChevronRight,
  Filter, FileCheck, ArrowUpRight, ShieldCheck, Tag
} from 'lucide-react';
import { PageHeader, ExportButton } from '@/components/ui/PageHeader';
import { Card, Badge, Button, StatCard, statusToVariant } from '@/components/ui/Card';
import { Modal, ConfirmDialog, FormField, inputClass } from '@/components/ui/Modal';
import { DataTable, type Column } from '@/components/ui/DataTable';

interface VaultPart {
  id: string;
  party_id: string | null;
  part_number: string;
  part_name: string;
  drawing_number: string | null;
  drawing_type: string | null;
  current_revision: number | string | null;
  status: string;
  created_at: string;
  updated_at: string;
  party_name?: string;
  documents_count?: number;
}

interface VaultDocument {
  id: string;
  party_id: string | null;
  part_id: string | null;
  document_number: string;
  document_name: string;
  drawing_number: string | null;
  part_number: string | null;
  document_type: string;
  category?: string;
  description?: string;
  current_version: number;
  status: string;
  file_type: string;
  created_by_name?: string;
  updated_by_name?: string;
  created_at: string;
  updated_at: string;
  party_name?: string;
}

interface VaultVersion {
  id: string;
  document_id: string;
  version_number: number;
  file_name: string;
  file_type: string;
  file_size: number;
  revision_notes?: string;
  status: string;
  uploaded_by_name?: string;
  uploaded_at: string;
}

interface VaultParty {
  id: string;
  name: string;
  code: string;
}

const DOCUMENT_TYPES = [
  '2D Drawing',
  '3D CAD Model',
  'Assembly Drawing',
  'Machining Drawing',
  'Sheet Metal Drawing',
  'Inspection Plan',
  'Specification Sheet',
  'BOM Reference'
];

const STATUS_OPTIONS = ['Draft', 'Under Review', 'Approved', 'Released', 'Superseded', 'Archived'];

export function CNCVaultPage() {
  const [activeTab, setActiveTab] = useState<'parts' | 'drawings'>('parts');
  const [loading, setLoading] = useState(true);

  // Data states
  const [parts, setParts] = useState<VaultPart[]>([]);
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [parties, setParties] = useState<VaultParty[]>([]);

  // Filter states
  const [partyFilter, setPartyFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');

  // Modal states
  const [showAddPart, setShowAddPart] = useState(false);
  const [editingPart, setEditingPart] = useState<VaultPart | null>(null);
  const [viewingPart, setViewingPart] = useState<VaultPart | null>(null);
  const [deletingPart, setDeletingPart] = useState<VaultPart | null>(null);

  const [showUploadDoc, setShowUploadDoc] = useState(false);
  const [uploadDocTargetPart, setUploadDocTargetPart] = useState<VaultPart | null>(null);
  const [viewingDocVersions, setViewingDocVersions] = useState<VaultDocument | null>(null);
  const [docVersionsList, setDocVersionsList] = useState<VaultVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [uploadNewVersionDoc, setUploadNewVersionDoc] = useState<VaultDocument | null>(null);
  const [deletingDoc, setDeletingDoc] = useState<VaultDocument | null>(null);

  // Part Form state
  const [partForm, setPartForm] = useState({
    partNumber: '',
    partName: '',
    partyId: '',
    drawingNumber: '',
    drawingType: 'Component Drawing',
    revision: '1',
    status: 'Approved'
  });

  // Document Upload Form state
  const [docForm, setDocForm] = useState({
    partId: '',
    docNumber: '',
    docName: '',
    drawingNumber: '',
    docType: '2D Drawing',
    status: 'Approved',
    fileType: 'PDF',
    fileName: '',
    revisionNotes: 'Initial release'
  });

  // New Version Form state
  const [newVersionForm, setNewVersionForm] = useState({
    fileName: '',
    fileType: 'PDF',
    status: 'Approved',
    revisionNotes: ''
  });

  // 1. Fetch data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [partsRes, docsRes, partiesRes] = await Promise.all([
        supabase.from('cncvault_parts').select('*').order('updated_at', { ascending: false }),
        supabase.from('cncvault_documents').select('*').order('updated_at', { ascending: false }),
        supabase.from('cncvault_parties').select('id, name, code').order('name')
      ]);

      const partiesMap = new Map((partiesRes.data || []).map((p: VaultParty) => [p.id, p.name]));
      const docsPerPart = new Map<string, number>();

      (docsRes.data || []).forEach((d: any) => {
        if (d.part_id) {
          docsPerPart.set(d.part_id, (docsPerPart.get(d.part_id) || 0) + 1);
        }
      });

      const enrichedParts: VaultPart[] = (partsRes.data || []).map((p: any) => ({
        ...p,
        party_name: p.party_id ? partiesMap.get(p.party_id) || 'Internal' : 'Internal',
        documents_count: docsPerPart.get(p.id) || 0
      }));

      const enrichedDocs: VaultDocument[] = (docsRes.data || []).map((d: any) => ({
        ...d,
        party_name: d.party_id ? partiesMap.get(d.party_id) || 'Internal' : 'Internal'
      }));

      setParts(enrichedParts);
      setDocuments(enrichedDocs);
      setParties(partiesRes.data || []);
    } catch (err) {
      console.error('Error fetching vault data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch versions for a document
  const openVersionHistory = async (doc: VaultDocument) => {
    setViewingDocVersions(doc);
    setVersionsLoading(true);
    try {
      const { data, error } = await supabase
        .from('cncvault_document_versions')
        .select('*')
        .eq('document_id', doc.id)
        .order('version_number', { ascending: false });
      if (!error && data) {
        setDocVersionsList(data);
      }
    } catch (err) {
      console.error('Error loading versions:', err);
    } finally {
      setVersionsLoading(false);
    }
  };

  // 2. Part Handlers
  const handleSavePart = async () => {
    if (!partForm.partNumber.trim() || !partForm.partName.trim()) {
      alert('Please fill in Part Number and Part Name.');
      return;
    }

    try {
      if (editingPart) {
        const { error } = await supabase
          .from('cncvault_parts')
          .update({
            part_number: partForm.partNumber.trim(),
            part_name: partForm.partName.trim(),
            party_id: partForm.partyId || null,
            drawing_number: partForm.drawingNumber.trim() || null,
            drawing_type: partForm.drawingType,
            current_revision: Number(partForm.revision) || 1,
            status: partForm.status,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingPart.id);

        if (error) throw error;
      } else {
        const newId = crypto.randomUUID();
        const { error } = await supabase.from('cncvault_parts').insert([{
          id: newId,
          part_number: partForm.partNumber.trim(),
          part_name: partForm.partName.trim(),
          party_id: partForm.partyId || null,
          drawing_number: partForm.drawingNumber.trim() || null,
          drawing_type: partForm.drawingType,
          current_revision: Number(partForm.revision) || 1,
          status: partForm.status,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }]);

        if (error) throw error;
      }

      setShowAddPart(false);
      setEditingPart(null);
      fetchData();
    } catch (err: any) {
      alert('Failed to save part: ' + err.message);
    }
  };

  const handleDeletePart = async () => {
    if (!deletingPart) return;
    try {
      const { error } = await supabase.from('cncvault_parts').delete().eq('id', deletingPart.id);
      if (error) throw error;
      setDeletingPart(null);
      fetchData();
    } catch (err: any) {
      alert('Failed to delete part: ' + err.message);
    }
  };

  // 3. Document Handlers
  const handleCreateDocument = async () => {
    if (!docForm.docNumber.trim() || !docForm.docName.trim()) {
      alert('Please enter Document Number and Name.');
      return;
    }

    try {
      const selectedPart = parts.find(p => p.id === docForm.partId);
      const newDocId = crypto.randomUUID();
      const partyId = selectedPart?.party_id || null;

      // Create document
      const { error: docErr } = await supabase.from('cncvault_documents').insert([{
        id: newDocId,
        party_id: partyId,
        part_id: selectedPart?.id || null,
        document_number: docForm.docNumber.trim(),
        document_name: docForm.docName.trim(),
        drawing_number: docForm.drawingNumber.trim() || selectedPart?.drawing_number || null,
        part_number: selectedPart?.part_number || null,
        document_type: docForm.docType,
        current_version: 1,
        status: docForm.status,
        file_type: docForm.fileType,
        created_by_name: 'Engineer',
        updated_by_name: 'Engineer',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }]);

      if (docErr) throw docErr;

      // Create Initial Version
      const newVersionId = crypto.randomUUID();
      const fileName = docForm.fileName.trim() || `${docForm.docNumber.trim()}_V1.${docForm.fileType.toLowerCase()}`;
      await supabase.from('cncvault_document_versions').insert([{
        id: newVersionId,
        document_id: newDocId,
        version_number: 1,
        file_name: fileName,
        file_type: docForm.fileType,
        file_size: 154200,
        revision_notes: docForm.revisionNotes || 'Initial engineering release',
        status: docForm.status,
        uploaded_by_name: 'Engineer',
        uploaded_at: new Date().toISOString()
      }]);

      setShowUploadDoc(false);
      setUploadDocTargetPart(null);
      fetchData();
    } catch (err: any) {
      alert('Failed to save document: ' + err.message);
    }
  };

  const handleUploadNewVersion = async () => {
    if (!uploadNewVersionDoc) return;
    try {
      const nextVer = (uploadNewVersionDoc.current_version || 1) + 1;
      const fileName = newVersionForm.fileName.trim() || `${uploadNewVersionDoc.document_number}_V${nextVer}.${newVersionForm.fileType.toLowerCase()}`;

      // Insert new version
      const { error: verErr } = await supabase.from('cncvault_document_versions').insert([{
        id: crypto.randomUUID(),
        document_id: uploadNewVersionDoc.id,
        version_number: nextVer,
        file_name: fileName,
        file_type: newVersionForm.fileType,
        file_size: 210400,
        revision_notes: newVersionForm.revisionNotes || `Revision update to V${nextVer}`,
        status: newVersionForm.status,
        uploaded_by_name: 'Engineer',
        uploaded_at: new Date().toISOString()
      }]);

      if (verErr) throw verErr;

      // Update document current_version and status
      await supabase.from('cncvault_documents').update({
        current_version: nextVer,
        status: newVersionForm.status,
        updated_at: new Date().toISOString()
      }).eq('id', uploadNewVersionDoc.id);

      // If document is linked to a part, update the part's current_revision as well
      if (uploadNewVersionDoc.part_id) {
        await supabase.from('cncvault_parts').update({
          current_revision: nextVer,
          updated_at: new Date().toISOString()
        }).eq('id', uploadNewVersionDoc.part_id);
      }

      setUploadNewVersionDoc(null);
      fetchData();
    } catch (err: any) {
      alert('Failed to upload new version: ' + err.message);
    }
  };

  const handleDeleteDocument = async () => {
    if (!deletingDoc) return;
    try {
      // Versions cascade delete
      const { error } = await supabase.from('cncvault_documents').delete().eq('id', deletingDoc.id);
      if (error) throw error;
      setDeletingDoc(null);
      fetchData();
    } catch (err: any) {
      alert('Failed to delete document: ' + err.message);
    }
  };

  // Filtered Parts
  const filteredParts = useMemo(() => {
    return parts.filter(p => {
      const matchesParty = partyFilter === 'All' || p.party_id === partyFilter;
      const matchesStatus = statusFilter === 'All' || p.status === statusFilter;
      return matchesParty && matchesStatus;
    });
  }, [parts, partyFilter, statusFilter]);

  // Filtered Documents
  const filteredDocuments = useMemo(() => {
    return documents.filter(d => {
      const matchesParty = partyFilter === 'All' || d.party_id === partyFilter;
      const matchesStatus = statusFilter === 'All' || d.status === statusFilter;
      const matchesType = typeFilter === 'All' || d.document_type === typeFilter;
      return matchesParty && matchesStatus && matchesType;
    });
  }, [documents, partyFilter, statusFilter, typeFilter]);

  // Stats computation
  const stats = useMemo(() => {
    const totalParts = parts.length;
    const totalDocs = documents.length;
    const approvedDocs = documents.filter(d => d.status === 'Approved' || d.status === 'Released').length;
    const underReview = documents.filter(d => d.status === 'Under Review' || d.status === 'Draft').length;
    return { totalParts, totalDocs, approvedDocs, underReview };
  }, [parts, documents]);

  // Parts Table Columns
  const partColumns: Column<VaultPart>[] = [
    {
      key: 'part_number',
      label: 'Part Number',
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-50 text-brand-600 border border-brand-100 flex items-center justify-center font-bold text-xs">
            <Boxes size={14} />
          </div>
          <div>
            <span className="font-mono font-bold text-slate-800 text-xs">{r.part_number}</span>
          </div>
        </div>
      )
    },
    {
      key: 'part_name',
      label: 'Part Name / Description',
      sortable: true,
      render: (r) => (
        <div>
          <span className="font-semibold text-slate-800 text-sm block">{r.part_name}</span>
          <span className="text-xs text-slate-400">{r.party_name}</span>
        </div>
      )
    },
    {
      key: 'drawing_number',
      label: 'Drawing No & Type',
      sortable: true,
      render: (r) => (
        <div>
          <span className="font-mono text-xs font-medium text-slate-700 block">{r.drawing_number || '—'}</span>
          <span className="text-[11px] text-slate-400">{r.drawing_type || 'Component'}</span>
        </div>
      )
    },
    {
      key: 'current_revision',
      label: 'Revision',
      align: 'center',
      sortable: true,
      render: (r) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
          Rev {r.current_revision ?? 1}
        </span>
      )
    },
    {
      key: 'documents_count',
      label: 'Drawings Attached',
      align: 'center',
      render: (r) => (
        <button 
          onClick={(e) => { e.stopPropagation(); setViewingPart(r); }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 hover:bg-brand-50 text-slate-700 hover:text-brand-700 transition-colors"
        >
          <Paperclip size={12} />
          <span>{r.documents_count} Files</span>
        </button>
      )
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (r) => (
        <Badge variant={statusToVariant(r.status)} dot>
          {r.status}
        </Badge>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'center',
      render: (r) => (
        <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setViewingPart(r)}
            className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"
            title="View Part & Drawings"
          >
            <Eye size={15} />
          </button>
          <button
            onClick={() => {
              setUploadDocTargetPart(r);
              setDocForm({
                partId: r.id,
                docNumber: `DOC-${r.part_number}`,
                docName: `${r.part_name} Drawing`,
                drawingNumber: r.drawing_number || '',
                docType: '2D Drawing',
                status: 'Approved',
                fileType: 'PDF',
                fileName: '',
                revisionNotes: `Attached to part ${r.part_number}`
              });
              setShowUploadDoc(true);
            }}
            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
            title="Attach New Drawing"
          >
            <UploadCloud size={15} />
          </button>
          <button
            onClick={() => {
              setEditingPart(r);
              setPartForm({
                partNumber: r.part_number,
                partName: r.part_name,
                partyId: r.party_id || '',
                drawingNumber: r.drawing_number || '',
                drawingType: r.drawing_type || 'Component Drawing',
                revision: String(r.current_revision || '1'),
                status: r.status
              });
              setShowAddPart(true);
            }}
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="Edit Part"
          >
            <Edit size={15} />
          </button>
          <button
            onClick={() => setDeletingPart(r)}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Delete Part"
          >
            <Trash2 size={15} />
          </button>
        </div>
      )
    }
  ];

  // Documents Table Columns
  const docColumns: Column<VaultDocument>[] = [
    {
      key: 'document_number',
      label: 'Document No',
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-bold text-xs">
            <FileText size={14} />
          </div>
          <div>
            <span className="font-mono font-bold text-slate-800 text-xs block">{r.document_number}</span>
            {r.part_number && (
              <span className="text-[10px] text-slate-400 font-mono">Part: {r.part_number}</span>
            )}
          </div>
        </div>
      )
    },
    {
      key: 'document_name',
      label: 'Drawing / Document Name',
      sortable: true,
      render: (r) => (
        <div>
          <span className="font-semibold text-slate-800 text-sm block">{r.document_name}</span>
          <span className="text-xs text-slate-400">{r.drawing_number ? `DWG: ${r.drawing_number}` : r.party_name}</span>
        </div>
      )
    },
    {
      key: 'document_type',
      label: 'Type & Format',
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
            {r.document_type}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200">
            {r.file_type}
          </span>
        </div>
      )
    },
    {
      key: 'current_version',
      label: 'Version',
      align: 'center',
      sortable: true,
      render: (r) => (
        <button
          onClick={(e) => { e.stopPropagation(); openVersionHistory(r); }}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors"
          title="Click to view full revision history"
        >
          <History size={12} />
          <span>V{r.current_version}</span>
        </button>
      )
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (r) => (
        <Badge variant={statusToVariant(r.status)} dot>
          {r.status}
        </Badge>
      )
    },
    {
      key: 'updated_at',
      label: 'Last Modified',
      sortable: true,
      render: (r) => (
        <div className="text-xs text-slate-500">
          <span>{r.updated_at ? new Date(r.updated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
          {r.updated_by_name && <span className="block text-[10px] text-slate-400">by {r.updated_by_name}</span>}
        </div>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'center',
      render: (r) => (
        <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => openVersionHistory(r)}
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
            title="View Revision History"
          >
            <History size={15} />
          </button>
          <button
            onClick={() => {
              setUploadNewVersionDoc(r);
              setNewVersionForm({
                fileName: `${r.document_number}_V${(r.current_version || 1) + 1}.${r.file_type.toLowerCase()}`,
                fileType: r.file_type || 'PDF',
                status: 'Approved',
                revisionNotes: ''
              });
            }}
            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
            title="Upload New Revision"
          >
            <UploadCloud size={15} />
          </button>
          <button
            onClick={() => setDeletingDoc(r)}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Delete Document"
          >
            <Trash2 size={15} />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      {/* 1. Header */}
      <PageHeader 
        title="Part & Drawings Management" 
        description="Engineering Part Master, CAD drawings, blueprints, and multi-version document vault"
        actions={
          <div className="flex items-center gap-2">
            {loading && <Badge variant="neutral">Syncing...</Badge>}
            <ExportButton />
            {activeTab === 'parts' ? (
              <Button 
                variant="primary" 
                onClick={() => {
                  setEditingPart(null);
                  setPartForm({
                    partNumber: `CNC-${Math.floor(1000 + Math.random() * 9000)}`,
                    partName: '',
                    partyId: '',
                    drawingNumber: '',
                    drawingType: 'Component Drawing',
                    revision: '1',
                    status: 'Approved'
                  });
                  setShowAddPart(true);
                }}
              >
                <Plus size={16} />
                <span>Add New Part</span>
              </Button>
            ) : (
              <Button 
                variant="primary" 
                onClick={() => {
                  setUploadDocTargetPart(null);
                  setDocForm({
                    partId: parts[0]?.id || '',
                    docNumber: `DOC-${Math.floor(1000 + Math.random() * 9000)}`,
                    docName: '',
                    drawingNumber: '',
                    docType: '2D Drawing',
                    status: 'Approved',
                    fileType: 'PDF',
                    fileName: '',
                    revisionNotes: 'Initial release'
                  });
                  setShowUploadDoc(true);
                }}
              >
                <UploadCloud size={16} />
                <span>Upload Drawing</span>
              </Button>
            )}
          </div>
        }
      />

      {/* 2. Top Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Parts Master" value={stats.totalParts.toString()} icon={<Boxes size={20} />} accent="brand" />
        <StatCard label="Total CAD / Drawings" value={stats.totalDocs.toString()} icon={<FileText size={20} />} accent="info" />
        <StatCard label="Approved / Released" value={stats.approvedDocs.toString()} icon={<CheckCircle2 size={20} />} accent="success" />
        <StatCard label="Under Review / Draft" value={stats.underReview.toString()} icon={<Clock size={20} />} accent="warning" />
      </div>

      {/* 3. Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 mb-6 bg-white rounded-t-xl px-4 pt-2">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('parts')}
            className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'parts'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Boxes size={16} />
            <span>Part Master ({parts.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('drawings')}
            className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'drawings'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText size={16} />
            <span>CAD & Drawings Vault ({documents.length})</span>
          </button>
        </div>

        {/* Global Filter Bar */}
        <div className="flex items-center gap-3 pb-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold">
            <Filter size={14} />
            <span>Party:</span>
            <select
              value={partyFilter}
              onChange={(e) => setPartyFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-xs rounded-md px-2 py-1 outline-none text-slate-700 font-medium"
            >
              <option value="All">All Parties</option>
              {parties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold">
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-xs rounded-md px-2 py-1 outline-none text-slate-700 font-medium"
            >
              <option value="All">All Statuses</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {activeTab === 'drawings' && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold">
              <span>Type:</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs rounded-md px-2 py-1 outline-none text-slate-700 font-medium"
              >
                <option value="All">All Types</option>
                {DOCUMENT_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* 4. Active Tab Content */}
      {activeTab === 'parts' ? (
        <DataTable
          data={filteredParts}
          columns={partColumns}
          searchKeys={['part_number', 'part_name', 'drawing_number', 'party_name', 'status']}
          pageSize={10}
          emptyMessage="No parts found in the Part Master."
          onRowClick={(p) => setViewingPart(p)}
        />
      ) : (
        <DataTable
          data={filteredDocuments}
          columns={docColumns}
          searchKeys={['document_number', 'document_name', 'drawing_number', 'part_number', 'document_type', 'status']}
          pageSize={10}
          emptyMessage="No engineering drawings or CAD documents found."
          onRowClick={(d) => openVersionHistory(d)}
        />
      )}

      {/* -------------------------------------------------------------------------- */}
      {/* MODAL: Add / Edit Part                                                     */}
      {/* -------------------------------------------------------------------------- */}
      <Modal
        open={showAddPart}
        onClose={() => { setShowAddPart(false); setEditingPart(null); }}
        title={editingPart ? 'Edit Part Record' : 'Register New Part in Master'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowAddPart(false); setEditingPart(null); }}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSavePart}>
              {editingPart ? 'Save Changes' : 'Create Part'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Part Number" required>
            <input
              className={inputClass}
              value={partForm.partNumber}
              onChange={(e) => setPartForm({ ...partForm, partNumber: e.target.value })}
              placeholder="e.g. CNC-2456"
            />
          </FormField>

          <FormField label="Customer / Party">
            <select
              className={inputClass}
              value={partForm.partyId}
              onChange={(e) => setPartForm({ ...partForm, partyId: e.target.value })}
            >
              <option value="">Internal / None</option>
              {parties.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
              ))}
            </select>
          </FormField>

          <div className="col-span-2">
            <FormField label="Part Name / Description" required>
              <input
                className={inputClass}
                value={partForm.partName}
                onChange={(e) => setPartForm({ ...partForm, partName: e.target.value })}
                placeholder="e.g. Bracket Assembly Mount"
              />
            </FormField>
          </div>

          <FormField label="Primary Drawing Number">
            <input
              className={inputClass}
              value={partForm.drawingNumber}
              onChange={(e) => setPartForm({ ...partForm, drawingNumber: e.target.value })}
              placeholder="e.g. DRG-2456"
            />
          </FormField>

          <FormField label="Drawing Type">
            <select
              className={inputClass}
              value={partForm.drawingType}
              onChange={(e) => setPartForm({ ...partForm, drawingType: e.target.value })}
            >
              <option>Assembly Drawing</option>
              <option>Component Drawing</option>
              <option>Machining Drawing</option>
              <option>Sheet Metal Drawing</option>
              <option>Electrical Drawing</option>
            </select>
          </FormField>

          <FormField label="Current Revision">
            <input
              type="number"
              className={inputClass}
              value={partForm.revision}
              onChange={(e) => setPartForm({ ...partForm, revision: e.target.value })}
              placeholder="1"
            />
          </FormField>

          <FormField label="Lifecycle Status">
            <select
              className={inputClass}
              value={partForm.status}
              onChange={(e) => setPartForm({ ...partForm, status: e.target.value })}
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </FormField>
        </div>
      </Modal>

      {/* -------------------------------------------------------------------------- */}
      {/* MODAL: Upload / Attach Document to Part                                    */}
      {/* -------------------------------------------------------------------------- */}
      <Modal
        open={showUploadDoc}
        onClose={() => { setShowUploadDoc(false); setUploadDocTargetPart(null); }}
        title={uploadDocTargetPart ? `Attach Drawing to Part ${uploadDocTargetPart.part_number}` : 'Upload Engineering Document / CAD'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowUploadDoc(false); setUploadDocTargetPart(null); }}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateDocument}>
              <UploadCloud size={16} />
              <span>Save & Register Document</span>
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Document Number" required>
            <input
              className={inputClass}
              value={docForm.docNumber}
              onChange={(e) => setDocForm({ ...docForm, docNumber: e.target.value })}
              placeholder="e.g. DOC-CNC-2456"
            />
          </FormField>

          <FormField label="Drawing Number (Optional)">
            <input
              className={inputClass}
              value={docForm.drawingNumber}
              onChange={(e) => setDocForm({ ...docForm, drawingNumber: e.target.value })}
              placeholder="e.g. DRG-2456"
            />
          </FormField>

          <div className="col-span-2">
            <FormField label="Document Title / Name" required>
              <input
                className={inputClass}
                value={docForm.docName}
                onChange={(e) => setDocForm({ ...docForm, docName: e.target.value })}
                placeholder="e.g. Final Machining Drawing V1"
              />
            </FormField>
          </div>

          <FormField label="Document Type">
            <select
              className={inputClass}
              value={docForm.docType}
              onChange={(e) => setDocForm({ ...docForm, docType: e.target.value })}
            >
              {DOCUMENT_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </FormField>

          <FormField label="File Format">
            <select
              className={inputClass}
              value={docForm.fileType}
              onChange={(e) => setDocForm({ ...docForm, fileType: e.target.value })}
            >
              <option value="PDF">PDF Document</option>
              <option value="DXF">AutoCAD DXF</option>
              <option value="DWG">AutoCAD DWG</option>
              <option value="STEP">STEP 3D Model</option>
              <option value="IGES">IGES 3D Model</option>
              <option value="ZIP">ZIP Package</option>
            </select>
          </FormField>

          <FormField label="File Name / Attachment">
            <input
              className={inputClass}
              value={docForm.fileName}
              onChange={(e) => setDocForm({ ...docForm, fileName: e.target.value })}
              placeholder="e.g. Bracket_Assembly_V1.pdf"
            />
          </FormField>

          <FormField label="Initial Status">
            <select
              className={inputClass}
              value={docForm.status}
              onChange={(e) => setDocForm({ ...docForm, status: e.target.value })}
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </FormField>

          <div className="col-span-2">
            <FormField label="Revision Notes / Changelog">
              <textarea
                className={inputClass}
                rows={2}
                value={docForm.revisionNotes}
                onChange={(e) => setDocForm({ ...docForm, revisionNotes: e.target.value })}
                placeholder="Initial release of manufacturing drawing."
              />
            </FormField>
          </div>
        </div>
      </Modal>

      {/* -------------------------------------------------------------------------- */}
      {/* MODAL: View Part Details & Attached Drawings                               */}
      {/* -------------------------------------------------------------------------- */}
      <Modal
        open={!!viewingPart}
        onClose={() => setViewingPart(null)}
        title={`Part Details: ${viewingPart?.part_number}`}
        size="xl"
        footer={
          <Button variant="secondary" onClick={() => setViewingPart(null)}>
            Close
          </Button>
        }
      >
        {viewingPart && (
          <div className="space-y-6">
            {/* Part Metadata Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Part Number</span>
                <span className="font-mono font-bold text-slate-800 text-sm">{viewingPart.part_number}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Part Name</span>
                <span className="font-semibold text-slate-800 text-sm">{viewingPart.part_name}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Customer / Party</span>
                <span className="font-medium text-slate-700 text-sm">{viewingPart.party_name}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Current Revision</span>
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                  Rev {viewingPart.current_revision ?? 1}
                </span>
              </div>
            </div>

            {/* Attached Drawings & Documents Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-sm text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <FileText size={16} className="text-brand-600" />
                  <span>Attached Engineering Drawings ({documents.filter(d => d.part_id === viewingPart.id).length})</span>
                </h4>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setUploadDocTargetPart(viewingPart);
                    setDocForm({
                      partId: viewingPart.id,
                      docNumber: `DOC-${viewingPart.part_number}`,
                      docName: `${viewingPart.part_name} Drawing`,
                      drawingNumber: viewingPart.drawing_number || '',
                      docType: '2D Drawing',
                      status: 'Approved',
                      fileType: 'PDF',
                      fileName: '',
                      revisionNotes: `Attached to part ${viewingPart.part_number}`
                    });
                    setShowUploadDoc(true);
                  }}
                >
                  <Plus size={14} />
                  <span>Attach New Drawing</span>
                </Button>
              </div>

              {documents.filter(d => d.part_id === viewingPart.id).length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-500 text-sm">
                  No drawings or CAD files attached to this part yet.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5">Document No</th>
                        <th className="px-4 py-2.5">Title</th>
                        <th className="px-4 py-2.5">Drawing No</th>
                        <th className="px-4 py-2.5">Type</th>
                        <th className="px-4 py-2.5 text-center">Version</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {documents.filter(d => d.part_id === viewingPart.id).map(doc => (
                        <tr key={doc.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-3 font-mono font-bold text-slate-800 text-xs">{doc.document_number}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">{doc.document_name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-600">{doc.drawing_number || '—'}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                              {doc.document_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              V{doc.current_version}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={statusToVariant(doc.status)} dot>
                              {doc.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => openVersionHistory(doc)}
                              className="text-xs font-semibold text-brand-600 hover:text-brand-800 hover:underline inline-flex items-center gap-1"
                            >
                              <History size={13} />
                              <span>History</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* -------------------------------------------------------------------------- */}
      {/* MODAL: Document Version History                                            */}
      {/* -------------------------------------------------------------------------- */}
      <Modal
        open={!!viewingDocVersions}
        onClose={() => setViewingDocVersions(null)}
        title={`Revision History: ${viewingDocVersions?.document_number}`}
        size="lg"
        footer={
          <div className="flex justify-between w-full">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                const doc = viewingDocVersions!;
                setUploadNewVersionDoc(doc);
                setNewVersionForm({
                  fileName: `${doc.document_number}_V${(doc.current_version || 1) + 1}.${doc.file_type.toLowerCase()}`,
                  fileType: doc.file_type || 'PDF',
                  status: 'Approved',
                  revisionNotes: ''
                });
              }}
            >
              <UploadCloud size={14} />
              <span>Upload New Revision</span>
            </Button>
            <Button variant="secondary" onClick={() => setViewingDocVersions(null)}>
              Close
            </Button>
          </div>
        }
      >
        {viewingDocVersions && (
          <div className="space-y-4">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex justify-between items-center text-xs">
              <div>
                <span className="font-bold text-slate-800 block text-sm">{viewingDocVersions.document_name}</span>
                <span className="text-slate-500">Document No: {viewingDocVersions.document_number} | Type: {viewingDocVersions.document_type}</span>
              </div>
              <Badge variant={statusToVariant(viewingDocVersions.status)}>
                Current: V{viewingDocVersions.current_version}
              </Badge>
            </div>

            {versionsLoading ? (
              <div className="p-8 text-center text-slate-400">Loading version history...</div>
            ) : docVersionsList.length === 0 ? (
              <div className="p-6 text-center text-slate-500">No version records found.</div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Version</th>
                      <th className="px-4 py-2.5">File Name</th>
                      <th className="px-4 py-2.5">Revision Notes</th>
                      <th className="px-4 py-2.5">Uploaded By</th>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {docVersionsList.map(v => (
                      <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            v.version_number === viewingDocVersions.current_version
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            V{v.version_number}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-800 font-semibold">
                          <span className="flex items-center gap-1.5">
                            <FileText size={14} className="text-slate-400" />
                            {v.file_name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px] truncate" title={v.revision_notes}>
                          {v.revision_notes || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{v.uploaded_by_name || 'Admin'}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {v.uploaded_at ? new Date(v.uploaded_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={statusToVariant(v.status)} dot>
                            {v.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* -------------------------------------------------------------------------- */}
      {/* MODAL: Upload New Version                                                  */}
      {/* -------------------------------------------------------------------------- */}
      <Modal
        open={!!uploadNewVersionDoc}
        onClose={() => setUploadNewVersionDoc(null)}
        title={`Upload New Revision for ${uploadNewVersionDoc?.document_number}`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUploadNewVersionDoc(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleUploadNewVersion}>
              <UploadCloud size={16} />
              <span>Release Revision V{(uploadNewVersionDoc?.current_version || 1) + 1}</span>
            </Button>
          </>
        }
      >
        {uploadNewVersionDoc && (
          <div className="space-y-4">
            <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 text-xs text-indigo-900">
              <span className="font-bold block">Current Active Version: V{uploadNewVersionDoc.current_version}</span>
              <span>This upload will automatically advance the drawing version to <strong>V{(uploadNewVersionDoc.current_version || 1) + 1}</strong> and archive previous revisions.</span>
            </div>

            <FormField label="New File Name / Drawing Reference" required>
              <input
                className={inputClass}
                value={newVersionForm.fileName}
                onChange={(e) => setNewVersionForm({ ...newVersionForm, fileName: e.target.value })}
              />
            </FormField>

            <FormField label="File Format">
              <select
                className={inputClass}
                value={newVersionForm.fileType}
                onChange={(e) => setNewVersionForm({ ...newVersionForm, fileType: e.target.value })}
              >
                <option value="PDF">PDF Document</option>
                <option value="DXF">AutoCAD DXF</option>
                <option value="DWG">AutoCAD DWG</option>
                <option value="STEP">STEP 3D Model</option>
                <option value="IGES">IGES 3D Model</option>
              </select>
            </FormField>

            <FormField label="Approval Status">
              <select
                className={inputClass}
                value={newVersionForm.status}
                onChange={(e) => setNewVersionForm({ ...newVersionForm, status: e.target.value })}
              >
                <option value="Approved">Approved</option>
                <option value="Released">Released</option>
                <option value="Under Review">Under Review</option>
                <option value="Draft">Draft</option>
              </select>
            </FormField>

            <FormField label="Engineering Change / Revision Notes" required>
              <textarea
                className={inputClass}
                rows={3}
                value={newVersionForm.revisionNotes}
                onChange={(e) => setNewVersionForm({ ...newVersionForm, revisionNotes: e.target.value })}
                placeholder="e.g. Dimensions updated per customer ECO #1042."
              />
            </FormField>
          </div>
        )}
      </Modal>

      {/* -------------------------------------------------------------------------- */}
      {/* CONFIRM DIALOG: Delete Part                                                */}
      {/* -------------------------------------------------------------------------- */}
      <ConfirmDialog
        open={!!deletingPart}
        onClose={() => setDeletingPart(null)}
        onConfirm={handleDeletePart}
        title="Delete Part Record"
        message={`Are you sure you want to delete part "${deletingPart?.part_number} - ${deletingPart?.part_name}"? This action cannot be undone.`}
        confirmText="Delete Part"
        variant="danger"
      />

      {/* -------------------------------------------------------------------------- */}
      {/* CONFIRM DIALOG: Delete Document                                            */}
      {/* -------------------------------------------------------------------------- */}
      <ConfirmDialog
        open={!!deletingDoc}
        onClose={() => setDeletingDoc(null)}
        onConfirm={handleDeleteDocument}
        title="Delete Document & Versions"
        message={`Are you sure you want to delete document "${deletingDoc?.document_number} - ${deletingDoc?.document_name}" along with all revision history?`}
        confirmText="Delete Document"
        variant="danger"
      />
    </div>
  );
}
