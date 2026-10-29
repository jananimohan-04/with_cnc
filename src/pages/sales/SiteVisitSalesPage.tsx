import { useState, useEffect, useMemo } from 'react';
import {
  MapPin, Calendar, Clock, User, Phone, Mail, FileText, CheckCircle2,
  AlertCircle, Plus, Search, Filter, ArrowUpRight, TrendingUp, Building2,
  Edit2, Trash2, Eye, ExternalLink, X, Save
} from 'lucide-react';
import { siteVisitsApi, type SiteVisit } from '@/lib/siteVisits';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Modal, FormField, inputClass } from '@/components/ui/Modal';
import { useNavigate } from 'react-router-dom';

export function SiteVisitSalesPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [visits, setVisits] = useState<SiteVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [salespersonFilter, setSalespersonFilter] = useState<string>('all');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<SiteVisit | null>(null);
  const [editVisit, setEditVisit] = useState<SiteVisit | null>(null);
  const [customers, setCustomers] = useState<{ id: string; name: string; contact?: string; phone?: string; city?: string }[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    customer_name: '',
    site_address: '',
    contact_person: '',
    contact_phone: '',
    contact_email: '',
    salesperson_name: profile?.full_name || 'Karan Mehta',
    visit_date: new Date().toISOString().slice(0, 10),
    visit_time: '11:00 AM',
    purpose: '',
    discussion_notes: '',
    interested_products: '',
    estimated_deal_value: 0,
    follow_up_date: '',
    next_action: '',
    related_quotation_no: '',
    related_sales_order_no: '',
    outcome_status: 'Scheduled' as SiteVisit['outcome_status'],
  });

  const loadVisits = async () => {
    setLoading(true);
    try {
      const data = await siteVisitsApi.listVisits();
      setVisits(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadVisits();
    // Load customer suggestions
    (async () => {
      try {
        const { data } = await supabase.from('cnc_customers').select('id, name, contact, phone, city').limit(100);
        if (data && data.length > 0) {
          setCustomers(data);
        } else {
          setCustomers([
            { id: 'c1', name: 'HAL Engine Division', contact: 'Dr. Venkat Raman', phone: '+91 94801 88990', city: 'Bengaluru' },
            { id: 'c2', name: 'Bharat Forge Heavy Machining', contact: 'Nitin Deshmukh', phone: '+91 98220 44556', city: 'Pune' },
            { id: 'c3', name: 'Godrej & Boyce Aerospace', contact: 'Sameer Patil', phone: '+91 98200 66778', city: 'Mumbai' },
            { id: 'c4', name: 'L&T Defense & Aerospace Complex', contact: 'Rajesh Kulkarni', phone: '+91 98451 22334', city: 'Bengaluru' },
            { id: 'c5', name: 'Sundram Fasteners Ltd', contact: 'Anand Kumar', phone: '+91 97890 11223', city: 'Chennai' },
          ]);
        }
      } catch {
        setCustomers([
          { id: 'c1', name: 'HAL Engine Division', contact: 'Dr. Venkat Raman', phone: '+91 94801 88990', city: 'Bengaluru' },
          { id: 'c2', name: 'Bharat Forge Heavy Machining', contact: 'Nitin Deshmukh', phone: '+91 98220 44556', city: 'Pune' },
          { id: 'c3', name: 'Godrej & Boyce Aerospace', contact: 'Sameer Patil', phone: '+91 98200 66778', city: 'Mumbai' },
        ]);
      }
    })();
  }, []);

  const handleCustomerSelect = (name: string) => {
    const matched = customers.find((c) => c.name === name);
    if (matched) {
      setFormData((prev) => ({
        ...prev,
        customer_name: matched.name,
        contact_person: matched.contact || prev.contact_person,
        contact_phone: matched.phone || prev.contact_phone,
        site_address: matched.city ? `${matched.city} Industrial Hub` : prev.site_address,
      }));
    } else {
      setFormData((prev) => ({ ...prev, customer_name: name }));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customer_name.trim()) return alert('Customer name is required');
    if (!formData.purpose.trim()) return alert('Visit purpose is required');

    try {
      if (editVisit) {
        await siteVisitsApi.updateVisit(editVisit.id, formData);
      } else {
        await siteVisitsApi.createVisit(formData);
      }
      setIsAddOpen(false);
      setEditVisit(null);
      void loadVisits();
    } catch (err: any) {
      alert(`Save error: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this site visit record?')) {
      await siteVisitsApi.deleteVisit(id);
      void loadVisits();
    }
  };

  // Filtered visits
  const filteredVisits = useMemo(() => {
    return visits.filter((v) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        v.customer_name.toLowerCase().includes(q) ||
        v.visit_no.toLowerCase().includes(q) ||
        v.purpose.toLowerCase().includes(q) ||
        v.site_address.toLowerCase().includes(q) ||
        v.salesperson_name.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || v.outcome_status === statusFilter;
      const matchesSalesperson = salespersonFilter === 'all' || v.salesperson_name === salespersonFilter;
      return matchesSearch && matchesStatus && matchesSalesperson;
    });
  }, [visits, searchQuery, statusFilter, salespersonFilter]);

  // KPIs
  const totalVisits = visits.length;
  const scheduledVisits = visits.filter((v) => v.outcome_status === 'Scheduled').length;
  const followUpVisits = visits.filter((v) => v.outcome_status === 'Follow-up Required').length;
  const wonVisits = visits.filter((v) => v.outcome_status === 'Deal Won' || v.outcome_status === 'Completed').length;
  const pipelineValue = visits.reduce((acc, v) => acc + (Number(v.estimated_deal_value) || 0), 0);

  const statusBadge = (status: SiteVisit['outcome_status']) => {
    switch (status) {
      case 'Completed':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">Completed</span>;
      case 'Scheduled':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">Scheduled</span>;
      case 'In Progress':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">In Progress</span>;
      case 'Follow-up Required':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800">Follow-up</span>;
      case 'Deal Won':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-teal-100 text-teal-800">Deal Won</span>;
      case 'Deal Lost':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800">Deal Lost</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-800">{status}</span>;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 bg-slate-50 min-h-screen">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Site Visit Sales</h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              Field Commercials
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Capture field visits, client site meetings, technical requirements, follow-ups, and quotation conversions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setEditVisit(null);
              setFormData({
                customer_name: '',
                site_address: '',
                contact_person: '',
                contact_phone: '',
                contact_email: '',
                salesperson_name: profile?.full_name || 'Karan Mehta',
                visit_date: new Date().toISOString().slice(0, 10),
                visit_time: '11:00 AM',
                purpose: '',
                discussion_notes: '',
                interested_products: '',
                estimated_deal_value: 0,
                follow_up_date: '',
                next_action: '',
                related_quotation_no: '',
                related_sales_order_no: '',
                outcome_status: 'Scheduled',
              });
              setIsAddOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm transition-colors"
          >
            <Plus size={16} /> Register Site Visit
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Site Visits</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{totalVisits}</div>
          <div className="text-xs text-slate-400 mt-0.5">Recorded customer meets</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Scheduled</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">{scheduledVisits}</div>
          <div className="text-xs text-slate-400 mt-0.5">Upcoming field agenda</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Follow-up Required</div>
          <div className="text-2xl font-bold text-purple-600 mt-1">{followUpVisits}</div>
          <div className="text-xs text-slate-400 mt-0.5">Pending quotation or specs</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Won / Completed</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{wonVisits}</div>
          <div className="text-xs text-slate-400 mt-0.5">Successfully closed visits</div>
        </div>
        <div className="col-span-2 sm:col-span-1 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Pipeline Value</div>
          <div className="text-2xl font-bold text-brand-600 mt-1">₹{(pipelineValue / 100000).toFixed(1)}L</div>
          <div className="text-xs text-slate-400 mt-0.5">Estimated opportunity pool</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search customer, location, visit #, purpose..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs sm:text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All Outcomes</option>
            <option value="Scheduled">Scheduled</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="Follow-up Required">Follow-up Required</option>
            <option value="Deal Won">Deal Won</option>
            <option value="Deal Lost">Deal Lost</option>
          </select>

          <button
            onClick={() => { setSearchQuery(''); setStatusFilter('all'); setSalespersonFilter('all'); }}
            className="text-xs text-slate-500 hover:text-slate-800 px-2 py-2 underline"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Visits Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Visit Ref</th>
                <th className="px-4 py-3">Customer & Site</th>
                <th className="px-4 py-3">Purpose & Discussion</th>
                <th className="px-4 py-3">Salesperson</th>
                <th className="px-4 py-3">Visit Date</th>
                <th className="px-4 py-3">Estimated Value</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-slate-400">Loading site visits...</td>
                </tr>
              ) : filteredVisits.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">
                    <MapPin size={32} className="mx-auto mb-2 text-slate-300" />
                    No site visits found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredVisits.map((visit) => (
                  <tr key={visit.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                      {visit.visit_no}
                      {visit.related_quotation_no && (
                        <span className="block text-[11px] font-normal text-brand-600">
                          Quote: {visit.related_quotation_no}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{visit.customer_name}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <MapPin size={12} className="text-slate-400 flex-shrink-0" />
                        <span className="truncate max-w-[200px]">{visit.site_address}</span>
                      </div>
                      <div className="text-[11px] text-slate-400">{visit.contact_person} {visit.contact_phone && `(${visit.contact_phone})`}</div>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="font-medium text-slate-800 truncate">{visit.purpose}</div>
                      <div className="text-xs text-slate-500 line-clamp-1">{visit.discussion_notes}</div>
                      {visit.interested_products && (
                        <div className="text-[11px] text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded mt-1 inline-block truncate max-w-[240px]">
                          Target: {visit.interested_products}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold">
                          {visit.salesperson_name.charAt(0)}
                        </div>
                        <span className="text-xs font-medium">{visit.salesperson_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">
                      <div className="font-semibold text-slate-800">{visit.visit_date}</div>
                      <div className="text-slate-400">{visit.visit_time}</div>
                      {visit.follow_up_date && (
                        <div className="text-[11px] text-purple-600 mt-0.5 font-medium">
                          Next: {visit.follow_up_date}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-900">
                      {visit.estimated_deal_value > 0 ? `₹${Number(visit.estimated_deal_value).toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {statusBadge(visit.outcome_status)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedVisit(visit)}
                          title="View Details"
                          className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-slate-100 rounded"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => {
                            setEditVisit(visit);
                            setFormData({
                              customer_name: visit.customer_name,
                              site_address: visit.site_address,
                              contact_person: visit.contact_person,
                              contact_phone: visit.contact_phone,
                              contact_email: visit.contact_email || '',
                              salesperson_name: visit.salesperson_name,
                              visit_date: visit.visit_date,
                              visit_time: visit.visit_time,
                              purpose: visit.purpose,
                              discussion_notes: visit.discussion_notes,
                              interested_products: visit.interested_products,
                              estimated_deal_value: visit.estimated_deal_value,
                              follow_up_date: visit.follow_up_date || '',
                              next_action: visit.next_action || '',
                              related_quotation_no: visit.related_quotation_no || '',
                              related_sales_order_no: visit.related_sales_order_no || '',
                              outcome_status: visit.outcome_status,
                            });
                            setIsAddOpen(true);
                          }}
                          title="Edit"
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(visit.id)}
                          title="Delete"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-2xl w-full p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <MapPin size={20} className="text-brand-600" />
                {editVisit ? `Edit Site Visit (${editVisit.visit_no})` : 'Register Client Site Visit'}
              </h2>
              <button
                onClick={() => { setIsAddOpen(false); setEditVisit(null); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Customer / Organization *</label>
                  <input
                    type="text"
                    list="customers_list"
                    value={formData.customer_name}
                    onChange={(e) => handleCustomerSelect(e.target.value)}
                    placeholder="Search or enter customer"
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
                    required
                  />
                  <datalist id="customers_list">
                    {customers.map((c) => (
                      <option key={c.id} value={c.name}>{c.city ? `(${c.city})` : ''}</option>
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Assigned Salesperson *</label>
                  <input
                    type="text"
                    value={formData.salesperson_name}
                    onChange={(e) => setFormData({ ...formData, salesperson_name: e.target.value })}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Customer Site Address *</label>
                  <input
                    type="text"
                    value={formData.site_address}
                    onChange={(e) => setFormData({ ...formData, site_address: e.target.value })}
                    placeholder="Plant, SEZ, or factory address"
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Contact Person & Designation</label>
                  <input
                    type="text"
                    value={formData.contact_person}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                    placeholder="e.g. Mr. Rajesh (Works Manager)"
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={formData.contact_phone}
                    onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                    placeholder="+91..."
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Visit Date</label>
                  <input
                    type="date"
                    value={formData.visit_date}
                    onChange={(e) => setFormData({ ...formData, visit_date: e.target.value })}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Visit Time</label>
                  <input
                    type="text"
                    value={formData.visit_time}
                    onChange={(e) => setFormData({ ...formData, visit_time: e.target.value })}
                    placeholder="e.g. 11:30 AM"
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Visit Purpose *</label>
                  <input
                    type="text"
                    value={formData.purpose}
                    onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                    placeholder="e.g. Technical capability audit & quotation review"
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Discussion & Technical Notes</label>
                  <textarea
                    rows={3}
                    value={formData.discussion_notes}
                    onChange={(e) => setFormData({ ...formData, discussion_notes: e.target.value })}
                    placeholder="Record key technical specs, component drawings reviewed, machine clearances, customer feedback..."
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Interested Products / Services</label>
                  <input
                    type="text"
                    value={formData.interested_products}
                    onChange={(e) => setFormData({ ...formData, interested_products: e.target.value })}
                    placeholder="e.g. 5-Axis Milling, Spares, Tooling"
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Estimated Deal Value (₹)</label>
                  <input
                    type="number"
                    value={formData.estimated_deal_value}
                    onChange={(e) => setFormData({ ...formData, estimated_deal_value: Number(e.target.value) })}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Follow-up Date</label>
                  <input
                    type="date"
                    value={formData.follow_up_date}
                    onChange={(e) => setFormData({ ...formData, follow_up_date: e.target.value })}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Next Action</label>
                  <input
                    type="text"
                    value={formData.next_action}
                    onChange={(e) => setFormData({ ...formData, next_action: e.target.value })}
                    placeholder="e.g. Submit quotation, arrange trial"
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Related Quotation # (Optional)</label>
                  <input
                    type="text"
                    value={formData.related_quotation_no}
                    onChange={(e) => setFormData({ ...formData, related_quotation_no: e.target.value })}
                    placeholder="e.g. QT-2026-089"
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Outcome Status</label>
                  <select
                    value={formData.outcome_status}
                    onChange={(e) => setFormData({ ...formData, outcome_status: e.target.value as any })}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 bg-white focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="Scheduled">Scheduled</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="Follow-up Required">Follow-up Required</option>
                    <option value="Deal Won">Deal Won</option>
                    <option value="Deal Lost">Deal Lost</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setIsAddOpen(false); setEditVisit(null); }}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm"
                >
                  {editVisit ? 'Update Visit' : 'Save Visit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Details Drawer */}
      {selectedVisit && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl p-6 overflow-y-auto space-y-6 animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-semibold text-brand-600 uppercase">{selectedVisit.visit_no}</span>
                <h3 className="text-lg font-bold text-slate-900">{selectedVisit.customer_name}</h3>
              </div>
              <button
                onClick={() => setSelectedVisit(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase">Site Location</div>
                <div className="text-sm text-slate-800 font-medium mt-0.5 flex items-center gap-1.5">
                  <MapPin size={15} className="text-brand-500" />
                  {selectedVisit.site_address}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <div className="text-xs text-slate-400">Contact Person</div>
                  <div className="text-sm font-medium text-slate-800">{selectedVisit.contact_person || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Phone</div>
                  <div className="text-sm font-medium text-slate-800">{selectedVisit.contact_phone || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Visit Scheduled</div>
                  <div className="text-sm font-medium text-slate-800">{selectedVisit.visit_date} at {selectedVisit.visit_time}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Salesperson</div>
                  <div className="text-sm font-medium text-slate-800">{selectedVisit.salesperson_name}</div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase">Meeting Purpose</div>
                <div className="text-sm text-slate-800 font-medium mt-0.5">{selectedVisit.purpose}</div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase">Discussion Notes</div>
                <div className="text-sm text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100 mt-1 leading-relaxed whitespace-pre-wrap">
                  {selectedVisit.discussion_notes || 'No discussion notes recorded.'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase">Interested Products</div>
                  <div className="text-sm font-medium text-slate-800 mt-0.5">{selectedVisit.interested_products || '—'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase">Estimated Value</div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                    {selectedVisit.estimated_deal_value > 0 ? `₹${Number(selectedVisit.estimated_deal_value).toLocaleString('en-IN')}` : '—'}
                  </div>
                </div>
              </div>

              <div className="bg-amber-50/60 border border-amber-200/80 p-3 rounded-xl">
                <div className="text-xs font-bold text-amber-900 uppercase">Next Action & Follow-up</div>
                <div className="text-sm text-amber-800 mt-1">{selectedVisit.next_action || 'No follow-up action scheduled.'}</div>
                {selectedVisit.follow_up_date && (
                  <div className="text-xs text-amber-700 font-semibold mt-1">Due date: {selectedVisit.follow_up_date}</div>
                )}
              </div>

              {selectedVisit.related_quotation_no && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs">
                    <span className="text-slate-400 uppercase font-semibold block">Linked Commercial Quote</span>
                    <span className="font-bold text-slate-900">{selectedVisit.related_quotation_no}</span>
                  </div>
                  <button
                    onClick={() => navigate('/sales/pipeline')}
                    className="inline-flex items-center gap-1 text-xs text-brand-600 font-semibold hover:underline"
                  >
                    Open in Pipeline <ArrowUpRight size={13} />
                  </button>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setSelectedVisit(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Close
              </button>
              <button
                onClick={() => {
                  const v = selectedVisit;
                  setSelectedVisit(null);
                  setEditVisit(v);
                  setFormData({
                    customer_name: v.customer_name,
                    site_address: v.site_address,
                    contact_person: v.contact_person,
                    contact_phone: v.contact_phone,
                    contact_email: v.contact_email || '',
                    salesperson_name: v.salesperson_name,
                    visit_date: v.visit_date,
                    visit_time: v.visit_time,
                    purpose: v.purpose,
                    discussion_notes: v.discussion_notes,
                    interested_products: v.interested_products,
                    estimated_deal_value: v.estimated_deal_value,
                    follow_up_date: v.follow_up_date || '',
                    next_action: v.next_action || '',
                    related_quotation_no: v.related_quotation_no || '',
                    related_sales_order_no: v.related_sales_order_no || '',
                    outcome_status: v.outcome_status,
                  });
                  setIsAddOpen(true);
                }}
                className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
              >
                Edit Visit Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
