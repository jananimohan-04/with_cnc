import { useEffect, useMemo, useState, useRef } from 'react';
import {
  LifeBuoy, PlusCircle, Wrench, MapPin, Calendar, Clock, User, Phone,
  CheckCircle2, AlertTriangle, AlertCircle, Camera, UploadCloud, Search,
  Filter, Eye, ChevronRight, X, FileText, Check, ShieldCheck, PlayCircle
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  supportApi, type SupportTicket, type SupportType, type TicketStatus,
  TICKET_PRIORITIES, TICKET_ISSUE_TYPES, uploadPending, supportFileUrl
} from '@/lib/support';
import { useHeaderKpis } from '@/contexts/HeaderKpiContext';
import { supabase } from '@/lib/supabase';
import { useLocation } from 'react-router-dom';

export function SupportCenterPage({ defaultType }: { defaultType?: SupportType }) {
  const { profile, isSuperAdmin, isCompanyAdmin } = useAuth();
  const location = useLocation();

  // Detect type from prop, query parameter, or path
  const initialType: 'all' | SupportType = useMemo(() => {
    if (defaultType) return defaultType;
    if (location.pathname.includes('/support/technical')) return 'technical';
    if (location.pathname.includes('/support/onsite')) return 'onsite';
    const q = new URLSearchParams(window.location.search).get('type');
    if (q === 'technical' || q === 'onsite') return q;
    return 'all';
  }, [defaultType, location.pathname]);

  const [typeFilter, setTypeFilter] = useState<'all' | SupportType>(initialType);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [technicianFilter, setTechnicianFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [registerType, setRegisterType] = useState<SupportType>(
    initialType === 'onsite' ? 'onsite' : 'technical'
  );

  // Register Form State
  const [formCustomer, setFormCustomer] = useState('');
  const [formContactPerson, setFormContactPerson] = useState('');
  const [formContactPhone, setFormContactPhone] = useState('');
  const [formSiteAddress, setFormSiteAddress] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formIssueType, setFormIssueType] = useState('Machine Breakdown');
  const [formPriority, setFormPriority] = useState('High');
  const [formDescription, setFormDescription] = useState('');
  const [formAssignedTo, setFormAssignedTo] = useState('');
  const [formScheduledDate, setFormScheduledDate] = useState(new Date().toISOString().slice(0, 10));
  const [formScheduledTime, setFormScheduledTime] = useState('10:00 AM');
  const [registerError, setRegisterError] = useState('');

  // Drawer / Action State
  const [workNotes, setWorkNotes] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [actualStartTime, setActualStartTime] = useState('');
  const [actualEndTime, setActualEndTime] = useState('');
  const [newStatus, setNewStatus] = useState<TicketStatus>('In Progress');
  const [completionPhotoPreview, setCompletionPhotoPreview] = useState<string | null>(null);
  const [completionPhotoFile, setCompletionPhotoFile] = useState<File | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [supervisorNotes, setSupervisorNotes] = useState('');
  const [supervisorChecked, setSupervisorChecked] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSupervisor = isSuperAdmin || isCompanyAdmin || profile?.role === 'SUPER_ADMIN' || profile?.role === 'COMPANY_ADMIN';

  const loadTickets = async () => {
    setLoading(true);
    try {
      const data = await supportApi.listTickets();
      setTickets(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTickets();
  }, []);

  // Sync drawer form state when selectedTicket changes
  useEffect(() => {
    if (selectedTicket) {
      setWorkNotes(selectedTicket.work_performed || '');
      setResolutionNotes(selectedTicket.resolution || '');
      setActualStartTime(selectedTicket.actual_start_time ? selectedTicket.actual_start_time.slice(11, 16) : '10:15');
      setActualEndTime(selectedTicket.actual_end_time ? selectedTicket.actual_end_time.slice(11, 16) : '15:30');
      setNewStatus(selectedTicket.status);
      setCompletionPhotoPreview(selectedTicket.completion_photo_url || null);
      setCompletionPhotoFile(null);
      setSupervisorNotes(selectedTicket.supervisor_notes || '');
      setSupervisorChecked(!!selectedTicket.supervisor_reviewed);
      setActionError('');
    }
  }, [selectedTicket]);

  // KPIs
  const totalCount = tickets.length;
  const openCount = tickets.filter((t) => t.status === 'Open').length;
  const assignedCount = tickets.filter((t) => t.status === 'Assigned' || t.status === 'Scheduled').length;
  const inProgressCount = tickets.filter((t) => t.status === 'In Progress').length;
  const completedCount = tickets.filter((t) => t.status === 'Completed' || t.status === 'Resolved' || t.status === 'Closed').length;
  const revisitCount = tickets.filter((t) => t.status === 'Revisit Required' || t.status === 'Need Information' || t.status === 'Pending').length;

  // Technicians list
  const technicianList = useMemo(() => {
    const names = new Set<string>();
    tickets.forEach((t) => {
      if (t.assigned_to_name) names.add(t.assigned_to_name);
    });
    return Array.from(names);
  }, [tickets]);

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        t.ticket_no.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        (t.customer_name && t.customer_name.toLowerCase().includes(q)) ||
        (t.site_address && t.site_address.toLowerCase().includes(q)) ||
        (t.assigned_to_name && t.assigned_to_name.toLowerCase().includes(q));

      const matchType = typeFilter === 'all' || t.support_type === typeFilter;
      const matchStatus = statusFilter === 'all' || t.status === statusFilter;
      const matchTech = technicianFilter === 'all' || t.assigned_to_name === technicianFilter;

      return matchSearch && matchType && matchStatus && matchTech;
    });
  }, [tickets, searchQuery, typeFilter, statusFilter, technicianFilter]);

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError('');

    if (!formCustomer.trim()) {
      setRegisterError('Customer name is required.');
      return;
    }
    if (!formSubject.trim()) {
      setRegisterError('Issue summary / subject is required.');
      return;
    }
    if (registerType === 'onsite' && !formSiteAddress.trim()) {
      setRegisterError('Site address is required for on-site support.');
      return;
    }

    try {
      const created = await supportApi.createSupportRequest({
        support_type: registerType,
        subject: formSubject.trim(),
        module: registerType === 'technical' ? 'engineering' : 'machine-log',
        issue_type: formIssueType,
        priority: formPriority,
        description: formDescription.trim(),
        customer_name: formCustomer.trim(),
        contact_person: formContactPerson.trim(),
        contact_phone: formContactPhone.trim(),
        site_address: formSiteAddress.trim(),
        assigned_to_name: formAssignedTo.trim() || undefined,
        scheduled_visit_date: registerType === 'onsite' ? formScheduledDate : undefined,
        scheduled_visit_time: registerType === 'onsite' ? formScheduledTime : undefined,
        created_by_name: profile?.full_name || 'Support Staff',
      });

      setIsRegisterOpen(false);
      void loadTickets();
      setSelectedTicket(created);
    } catch (err: any) {
      setRegisterError(err.message || 'Failed to register support request.');
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setActionError('Only image files (JPG, PNG, WebP) are accepted as completion evidence.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setActionError('Photograph must be 5 MB or smaller.');
      return;
    }

    setActionError('');
    setCompletionPhotoFile(file);
    const url = URL.createObjectURL(file);
    setCompletionPhotoPreview(url);
  };

  const handleUpdateRecord = async () => {
    if (!selectedTicket) return;
    setActionError('');

    // Strict validation rule: On-site Completed status requires photo and work details
    if (selectedTicket.support_type === 'onsite' && newStatus === 'Completed') {
      if (!completionPhotoPreview && !completionPhotoFile) {
        setActionError('Mandatory Requirement: You must upload a completion photograph as evidence of the visit before marking status as Completed.');
        return;
      }
      if (!workNotes.trim() || workNotes.trim().length < 10) {
        setActionError('Mandatory Requirement: Please provide detailed notes on the work performed and observations before completing.');
        return;
      }
    }

    if (selectedTicket.support_type === 'technical' && (newStatus === 'Resolved' || newStatus === 'Closed')) {
      if (!resolutionNotes.trim()) {
        setActionError('Mandatory Requirement: Please provide the technical resolution details before closing or resolving.');
        return;
      }
    }

    setPhotoUploading(true);
    try {
      let photoUrl = selectedTicket.completion_photo_url || null;

      if (completionPhotoFile) {
        const uploaded = await uploadPending(completionPhotoFile);
        photoUrl = completionPhotoPreview || uploaded.path;
      }

      const updated = await supportApi.updateTicket(selectedTicket.id, {
        status: newStatus,
        work_performed: workNotes,
        resolution: resolutionNotes,
        actual_start_time: selectedTicket.support_type === 'onsite' ? `2026-10-29T${actualStartTime}:00Z` : undefined,
        actual_end_time: selectedTicket.support_type === 'onsite' ? `2026-10-29T${actualEndTime}:00Z` : undefined,
        completion_photo_url: photoUrl,
        completed_at: newStatus === 'Completed' || newStatus === 'Resolved' ? new Date().toISOString() : selectedTicket.completed_at,
        completed_by_name: selectedTicket.assigned_to_name || profile?.full_name || 'Technician',
      });

      setSelectedTicket(updated);
      void loadTickets();
      alert('Support record updated successfully.');
    } catch (err: any) {
      setActionError(err.message || 'Failed to update ticket.');
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleSupervisorReview = async () => {
    if (!selectedTicket) return;
    if (!supervisorNotes.trim()) {
      setActionError('Please provide supervisor review remarks before approving.');
      return;
    }

    try {
      const reviewed = await supportApi.reviewTicket(
        selectedTicket.id,
        profile?.full_name || 'Service Head',
        supervisorNotes.trim()
      );
      setSelectedTicket(reviewed);
      setSupervisorChecked(true);
      void loadTickets();
      alert('Service record approved by supervisor.');
    } catch (err: any) {
      setActionError(err.message || 'Review failed.');
    }
  };

  const getStatusBadge = (status: TicketStatus) => {
    switch (status) {
      case 'Completed':
      case 'Resolved':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">Completed</span>;
      case 'Scheduled':
      case 'Assigned':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">{status}</span>;
      case 'In Progress':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">In Progress</span>;
      case 'Revisit Required':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">Revisit Required</span>;
      case 'Open':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-800 border border-cyan-200">Open</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">{status}</span>;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 bg-slate-50 min-h-screen">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Support Center</h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-cyan-100 text-cyan-800 border border-cyan-200">
              Service Desk & Field Engineering
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Unified operations for Technical Support (remote diagnostics) and On-site Support (customer field visits).
          </p>
        </div>

        <button
          onClick={() => {
            setRegisterType(typeFilter === 'onsite' ? 'onsite' : 'technical');
            setFormCustomer('');
            setFormSubject('');
            setFormDescription('');
            setFormSiteAddress('');
            setFormContactPerson('');
            setFormContactPhone('');
            setFormAssignedTo('');
            setRegisterError('');
            setIsRegisterOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm transition-colors"
        >
          <PlusCircle size={16} /> Register Support Request
        </button>
      </div>

      {/* 6 KPI Cards Matching Requirements */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div
          onClick={() => setStatusFilter('all')}
          className={`cursor-pointer bg-white p-3.5 rounded-xl border transition-all ${
            statusFilter === 'all' ? 'border-brand-500 ring-2 ring-brand-500/10 shadow-sm' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Requests</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{totalCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">All service tasks</div>
        </div>

        <div
          onClick={() => setStatusFilter('Open')}
          className={`cursor-pointer bg-white p-3.5 rounded-xl border transition-all ${
            statusFilter === 'Open' ? 'border-cyan-500 ring-2 ring-cyan-500/10 shadow-sm' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Open Requests</div>
          <div className="text-2xl font-bold text-cyan-600 mt-1">{openCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Awaiting dispatch</div>
        </div>

        <div
          onClick={() => setStatusFilter('Assigned')}
          className={`cursor-pointer bg-white p-3.5 rounded-xl border transition-all ${
            statusFilter === 'Assigned' || statusFilter === 'Scheduled' ? 'border-blue-500 ring-2 ring-blue-500/10 shadow-sm' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Assigned / Sched.</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">{assignedCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Allocated to tech</div>
        </div>

        <div
          onClick={() => setStatusFilter('In Progress')}
          className={`cursor-pointer bg-white p-3.5 rounded-xl border transition-all ${
            statusFilter === 'In Progress' ? 'border-amber-500 ring-2 ring-amber-500/10 shadow-sm' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">In Progress</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{inProgressCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Active troubleshooting</div>
        </div>

        <div
          onClick={() => setStatusFilter('Completed')}
          className={`cursor-pointer bg-white p-3.5 rounded-xl border transition-all ${
            statusFilter === 'Completed' ? 'border-emerald-500 ring-2 ring-emerald-500/10 shadow-sm' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Completed</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{completedCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Evidence & closed</div>
        </div>

        <div
          onClick={() => setStatusFilter('Revisit Required')}
          className={`cursor-pointer bg-white p-3.5 rounded-xl border transition-all ${
            statusFilter === 'Revisit Required' ? 'border-rose-500 ring-2 ring-rose-500/10 shadow-sm' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Revisit Required</div>
          <div className="text-2xl font-bold text-rose-600 mt-1">{revisitCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Spares / return needed</div>
        </div>
      </div>

      {/* Support Type Pills & Filter Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          {/* Type Toggle Tabs */}
          <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                typeFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Requests ({totalCount})
            </button>
            <button
              onClick={() => setTypeFilter('technical')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                typeFilter === 'technical' ? 'bg-white text-indigo-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LifeBuoy size={14} className="text-indigo-600" />
              Technical Support ({tickets.filter((t) => t.support_type === 'technical').length})
            </button>
            <button
              onClick={() => setTypeFilter('onsite')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                typeFilter === 'onsite' ? 'bg-white text-emerald-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wrench size={14} className="text-emerald-600" />
              On-site Support ({tickets.filter((t) => t.support_type === 'onsite').length})
            </button>
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-1">
            <span>Showing {filteredTickets.length} of {tickets.length} requests</span>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search ticket #, customer, issue, site address, or technician..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-700"
            >
              <option value="all">All Statuses</option>
              <option value="Open">Open</option>
              <option value="Assigned">Assigned</option>
              <option value="Scheduled">Scheduled</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Revisit Required">Revisit Required</option>
            </select>

            <select
              value={technicianFilter}
              onChange={(e) => setTechnicianFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-700 max-w-[180px]"
            >
              <option value="all">All Technicians</option>
              {technicianList.map((tech) => (
                <option key={tech} value={tech}>{tech}</option>
              ))}
            </select>

            <button
              onClick={() => { setSearchQuery(''); setStatusFilter('all'); setTechnicianFilter('all'); }}
              className="text-xs text-slate-500 hover:text-slate-800 px-2 underline"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Ticket / Req #</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Customer & Site</th>
                <th className="px-4 py-3">Issue Summary</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Assigned Tech</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">Loading support records...</td>
                </tr>
              ) : filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">
                    <LifeBuoy size={32} className="mx-auto mb-2 text-slate-300" />
                    No support requests match the current filters.
                  </td>
                </tr>
              ) : (
                filteredTickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => setSelectedTicket(ticket)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap font-semibold text-slate-900">
                      {ticket.ticket_no}
                      <span className="block text-[11px] font-normal text-slate-400">
                        {ticket.created_at ? new Date(ticket.created_at).toLocaleDateString() : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {ticket.support_type === 'onsite' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Wrench size={12} /> On-site
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <LifeBuoy size={12} /> Technical
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{ticket.customer_name || 'Organization'}</div>
                      {ticket.site_address && (
                        <div className="text-xs text-slate-500 flex items-center gap-1 truncate max-w-[200px]">
                          <MapPin size={11} className="text-slate-400 flex-shrink-0" />
                          <span className="truncate">{ticket.site_address}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="font-medium text-slate-800 truncate">{ticket.subject}</div>
                      <div className="text-xs text-slate-500 truncate">{ticket.description}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                          ticket.priority === 'Critical'
                            ? 'bg-rose-100 text-rose-800'
                            : ticket.priority === 'High'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {ticket.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-700">
                      {ticket.assigned_to_name ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-bold">
                            {ticket.assigned_to_name.charAt(0)}
                          </div>
                          <span className="font-medium truncate max-w-[140px]">{ticket.assigned_to_name}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getStatusBadge(ticket.status)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTicket(ticket);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline"
                      >
                        View & Update <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Register Support Request Modal */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-2xl w-full p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Register Support Request</h2>
                <p className="text-xs text-slate-500">Create a new technical ticket or schedule an on-site engineer visit.</p>
              </div>
              <button onClick={() => setIsRegisterOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {/* Type Selector Tabs */}
            <div className="grid grid-cols-2 gap-3 p-1 rounded-xl bg-slate-100 border border-slate-200">
              <button
                type="button"
                onClick={() => setRegisterType('technical')}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  registerType === 'technical' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LifeBuoy size={16} /> 1. Technical Support (Remote)
              </button>
              <button
                type="button"
                onClick={() => setRegisterType('onsite')}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  registerType === 'onsite' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Wrench size={16} /> 2. On-site Support (Field Visit)
              </button>
            </div>

            {registerError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle size={15} /> {registerError}
              </div>
            )}

            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Customer / Organization *</label>
                  <input
                    type="text"
                    value={formCustomer}
                    onChange={(e) => setFormCustomer(e.target.value)}
                    placeholder="e.g. AeroPrecision Components, HAL, Sundram Fasteners..."
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
                    required
                  />
                </div>

                {registerType === 'onsite' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Contact Person</label>
                      <input
                        type="text"
                        value={formContactPerson}
                        onChange={(e) => setFormContactPerson(e.target.value)}
                        placeholder="Plant supervisor / Works Manager"
                        className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Contact Phone</label>
                      <input
                        type="text"
                        value={formContactPhone}
                        onChange={(e) => setFormContactPhone(e.target.value)}
                        placeholder="+91..."
                        className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Site Address *</label>
                      <input
                        type="text"
                        value={formSiteAddress}
                        onChange={(e) => setFormSiteAddress(e.target.value)}
                        placeholder="Customer factory / bay location"
                        className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Scheduled Visit Date</label>
                      <input
                        type="date"
                        value={formScheduledDate}
                        onChange={(e) => setFormScheduledDate(e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Scheduled Visit Time</label>
                      <input
                        type="text"
                        value={formScheduledTime}
                        onChange={(e) => setFormScheduledTime(e.target.value)}
                        placeholder="e.g. 10:00 AM"
                        className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </>
                )}

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Issue Subject / Summary *</label>
                  <input
                    type="text"
                    value={formSubject}
                    onChange={(e) => setFormSubject(e.target.value)}
                    placeholder="Brief description of machine problem or technical request"
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Issue Category</label>
                  <select
                    value={formIssueType}
                    onChange={(e) => setFormIssueType(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 bg-white"
                  >
                    {TICKET_ISSUE_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Priority</label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 bg-white"
                  >
                    {TICKET_PRIORITIES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Detailed Description *</label>
                  <textarea
                    rows={3}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Provide specific alarm codes, symptoms, machine model, tooling involved..."
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Assign Technician / Engineer {registerType === 'onsite' ? '(Field Visit)' : '(Remote)'}
                  </label>
                  <input
                    type="text"
                    value={formAssignedTo}
                    onChange={(e) => setFormAssignedTo(e.target.value)}
                    placeholder="e.g. Vikram Sen, Mahesh Gowda, K. Ramesh..."
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRegisterOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm"
                >
                  Register Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Comprehensive Detail & Update Drawer */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl p-6 overflow-y-auto space-y-6 animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-brand-600 uppercase tracking-wider">{selectedTicket.ticket_no}</span>
                  {selectedTicket.support_type === 'onsite' ? (
                    <span className="text-[11px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">On-site Support</span>
                  ) : (
                    <span className="text-[11px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">Technical Support</span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-slate-900 mt-1">{selectedTicket.subject}</h3>
                <div className="text-xs text-slate-500 mt-0.5">{selectedTicket.customer_name}</div>
              </div>
              <button
                onClick={() => setSelectedTicket(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Error banner */}
            {actionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2">
                <AlertCircle size={16} className="text-rose-600 flex-shrink-0 mt-0.5" />
                <div>{actionError}</div>
              </div>
            )}

            {/* Request Overview */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400 block font-medium">Issue Category</span>
                  <span className="font-semibold text-slate-800">{selectedTicket.issue_type}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Priority</span>
                  <span className="font-semibold text-slate-800">{selectedTicket.priority}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Assigned Engineer</span>
                  <span className="font-semibold text-slate-800">{selectedTicket.assigned_to_name || 'Unassigned'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Current Status</span>
                  {getStatusBadge(selectedTicket.status)}
                </div>
              </div>

              {selectedTicket.support_type === 'onsite' && selectedTicket.site_address && (
                <div className="border-t border-slate-200 pt-2">
                  <span className="text-slate-400 block font-medium">Customer Site Address</span>
                  <span className="font-semibold text-slate-800 flex items-center gap-1 mt-0.5">
                    <MapPin size={12} className="text-brand-500 flex-shrink-0" />
                    {selectedTicket.site_address}
                  </span>
                  {selectedTicket.contact_person && (
                    <span className="text-slate-500 block text-[11px] mt-0.5">
                      Contact: {selectedTicket.contact_person} {selectedTicket.contact_phone && `(${selectedTicket.contact_phone})`}
                    </span>
                  )}
                  {selectedTicket.scheduled_visit_date && (
                    <span className="text-indigo-700 block text-[11px] font-semibold mt-0.5">
                      Scheduled Visit: {selectedTicket.scheduled_visit_date} at {selectedTicket.scheduled_visit_time || '10:00 AM'}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Reported Issue Details</span>
              <div className="text-xs sm:text-sm text-slate-700 bg-white p-3 rounded-xl border border-slate-200 mt-1 leading-relaxed">
                {selectedTicket.description}
              </div>
            </div>

            {/* On-site Time Tracking */}
            {selectedTicket.support_type === 'onsite' && (
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Actual Visit Start Time</label>
                  <input
                    type="time"
                    value={actualStartTime}
                    onChange={(e) => setActualStartTime(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Actual Visit End Time</label>
                  <input
                    type="time"
                    value={actualEndTime}
                    onChange={(e) => setActualEndTime(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white"
                  />
                </div>
              </div>
            )}

            {/* Technician Work Performed & Observations */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Work Performed & Observations
                </label>
                <textarea
                  rows={3}
                  value={workNotes}
                  onChange={(e) => setWorkNotes(e.target.value)}
                  placeholder="Record diagnostics performed, parts replaced, calibrations, root cause observations..."
                  className="w-full text-xs sm:text-sm border border-slate-200 rounded-xl p-2.5 focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Resolution / Outcome Summary
                </label>
                <textarea
                  rows={2}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Final resolution statement or revisit requirements..."
                  className="w-full text-xs sm:text-sm border border-slate-200 rounded-xl p-2.5 focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            {/* Completion Photograph Evidence (Strict Requirement for On-site) */}
            <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Camera size={15} className="text-brand-600" />
                    Completion Photograph Evidence
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {selectedTicket.support_type === 'onsite'
                      ? 'Strict Requirement: A photograph of the completed work / machine sign-off is required before completion.'
                      : 'Optional technical screenshot or calibration photograph.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg flex items-center gap-1 transition-colors"
                >
                  <UploadCloud size={14} /> Upload Evidence
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
              </div>

              {completionPhotoPreview ? (
                <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-black/5 aspect-video flex items-center justify-center">
                  <img
                    src={completionPhotoPreview}
                    alt="Completion Evidence"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] px-2 py-0.5 rounded font-mono">
                    ✓ Evidence Verified • {selectedTicket.ticket_no}
                  </div>
                </div>
              ) : (
                <div className="p-4 border border-dashed border-slate-300 rounded-lg text-center text-xs text-slate-400">
                  No completion photograph uploaded yet.
                </div>
              )}
            </div>

            {/* Status Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Update Status
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as TicketStatus)}
                className="w-full text-xs sm:text-sm border border-slate-200 rounded-xl p-2.5 bg-white font-semibold text-slate-800"
              >
                <option value="Open">Open</option>
                <option value="Assigned">Assigned</option>
                <option value="Scheduled">Scheduled</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed (Requires Photograph & Work Details)</option>
                <option value="Revisit Required">Revisit Required (Pending Parts / Follow-up)</option>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed</option>
              </select>
            </div>

            {/* Supervisor Review Section */}
            <div className="border border-indigo-100 rounded-xl p-3.5 bg-indigo-50/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck size={16} className="text-indigo-600" />
                  Supervisor Review & Sign-Off
                </span>
                {selectedTicket.supervisor_reviewed && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    ✓ Reviewed by {selectedTicket.supervisor_name || 'Supervisor'}
                  </span>
                )}
              </div>

              <textarea
                rows={2}
                value={supervisorNotes}
                onChange={(e) => setSupervisorNotes(e.target.value)}
                placeholder="Supervisor remarks on quality, evidence validation, and completion sign-off..."
                className="w-full text-xs border border-indigo-200 rounded-lg p-2 bg-white"
                disabled={!isSupervisor}
              />

              {isSupervisor && !selectedTicket.supervisor_reviewed && (
                <button
                  type="button"
                  onClick={handleSupervisorReview}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                >
                  Approve Service Record as Supervisor
                </button>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleUpdateRecord}
                disabled={photoUploading}
                className="px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm disabled:opacity-50"
              >
                {photoUploading ? 'Saving...' : 'Save & Update Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
