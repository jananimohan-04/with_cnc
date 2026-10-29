import { useState, useMemo } from 'react';
import {
  Users2, ShoppingCart, Percent, TrendingUp, Search, Filter, CheckCircle2,
  AlertTriangle, ArrowUpRight, Eye, Package, Building2, Store, Clock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PartnerOrder {
  id: string;
  order_no: string;
  partner_name: string;
  partner_type: 'Regional Partner (15%)' | 'Channel Partner (10%)' | 'Referral Partner (5%)' | 'Web Storefront (Direct)';
  client_organization: string;
  product_summary: string;
  order_date: string;
  gross_value: number;
  partner_margin_pct: number;
  partner_commission: number;
  net_amount: number;
  status: 'Pending Verification' | 'Approved' | 'Sent to Production' | 'Delivered' | 'Paid';
  delivery_timeline: string;
}

const SEED_PARTNER_ORDERS: PartnerOrder[] = [
  {
    id: 'po-101',
    order_no: 'PO-PARTNER-2026-081',
    partner_name: 'Apex Industrial Solutions (West)',
    partner_type: 'Regional Partner (15%)',
    client_organization: 'Thermax Heavy Engineering',
    product_summary: '4x High-Pressure Hydraulic Pump Spares & Manifold Assembly',
    order_date: '2026-10-28',
    gross_value: 380000,
    partner_margin_pct: 15,
    partner_commission: 57000,
    net_amount: 323000,
    status: 'Pending Verification',
    delivery_timeline: '3 Weeks',
  },
  {
    id: 'po-102',
    order_no: 'PO-STORE-2026-049',
    partner_name: 'Digital Online Storefront',
    partner_type: 'Web Storefront (Direct)',
    client_organization: 'Indo-MIM Bangalore Component Bay',
    product_summary: '50x Tungsten Carbide Milling Inserts (APMT 1135)',
    order_date: '2026-10-27',
    gross_value: 125000,
    partner_margin_pct: 0,
    partner_commission: 0,
    net_amount: 125000,
    status: 'Approved',
    delivery_timeline: '48 Hours',
  },
  {
    id: 'po-103',
    order_no: 'PO-PARTNER-2026-079',
    partner_name: 'Matrix Machine Tool Network',
    partner_type: 'Channel Partner (10%)',
    client_organization: 'Roots Industries India Ltd',
    product_summary: '2x Precision BT-40 Toolholder Packages & Pull Studs',
    order_date: '2026-10-25',
    gross_value: 240000,
    partner_margin_pct: 10,
    partner_commission: 24000,
    net_amount: 216000,
    status: 'Sent to Production',
    delivery_timeline: '10 Days',
  },
  {
    id: 'po-104',
    order_no: 'PO-PARTNER-2026-075',
    partner_name: 'Southern CNC Consumables',
    partner_type: 'Referral Partner (5%)',
    client_organization: 'Craftsman Automation Ltd',
    product_summary: '1x Custom Workholding Fixture Plate (Grade 7075-T6)',
    order_date: '2026-10-20',
    gross_value: 490000,
    partner_margin_pct: 5,
    partner_commission: 24500,
    net_amount: 465500,
    status: 'Delivered',
    delivery_timeline: 'Delivered',
  },
];

export function PartnerOrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PartnerOrder[]>(SEED_PARTNER_ORDERS);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<PartnerOrder | null>(null);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const q = search.toLowerCase();
      const matchSearch =
        o.order_no.toLowerCase().includes(q) ||
        o.partner_name.toLowerCase().includes(q) ||
        o.client_organization.toLowerCase().includes(q) ||
        o.product_summary.toLowerCase().includes(q);
      const matchType = typeFilter === 'all' || o.partner_type.includes(typeFilter);
      const matchStatus = statusFilter === 'all' || o.status === statusFilter;
      return matchSearch && matchType && matchStatus;
    });
  }, [orders, search, typeFilter, statusFilter]);

  const handleApprove = (id: string) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: 'Approved' } : o))
    );
    if (selectedOrder?.id === id) {
      setSelectedOrder((prev) => (prev ? { ...prev, status: 'Approved' } : null));
    }
  };

  const totalGross = orders.reduce((acc, o) => acc + o.gross_value, 0);
  const totalCommission = orders.reduce((acc, o) => acc + o.partner_commission, 0);
  const netSales = totalGross - totalCommission;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 bg-slate-50 min-h-screen">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Partner & Online Sales</h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
              Channel Network
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            B2B partner network sales with dealer margins (Regional, Channel, Referral) and self-service online storefront orders.
          </p>
        </div>

        <button
          onClick={() => navigate('/store/home')}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-xs transition-colors"
        >
          <Store size={16} /> Open Digital Storefront
        </button>
      </div>

      {/* Confirmation Flag Notice */}
      <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200/90 text-amber-900 flex items-start gap-3">
        <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm">
          <span className="font-bold uppercase tracking-wider block text-amber-800 text-[11px]">
            Third Sales Type – Identified for Confirmation
          </span>
          This module unites the existing codebase&apos;s dealer partner tiers (Regional Partner 15%, Channel Partner 10%, Referral Partner 5%) and the direct customer storefront checkout. If you require a different specialized 3rd sales category (e.g., Export Sales or Government Tenders), please confirm.
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Channel Orders</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{orders.length}</div>
          <div className="text-xs text-slate-400 mt-0.5">Partner + Storefront combined</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Gross Order Value</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">₹{(totalGross / 100000).toFixed(2)}L</div>
          <div className="text-xs text-slate-400 mt-0.5">Total booked volume</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Dealer Margins Payable</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">₹{(totalCommission / 1000).toFixed(1)}k</div>
          <div className="text-xs text-slate-400 mt-0.5">Tiered partner commissions</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Net Realization</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">₹{(netSales / 100000).toFixed(2)}L</div>
          <div className="text-xs text-slate-400 mt-0.5">Retained manufacturing sales</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search order #, partner, client organization, products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-xs sm:text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All Channel Types</option>
            <option value="Regional">Regional Partner (15%)</option>
            <option value="Channel">Channel Partner (10%)</option>
            <option value="Referral">Referral Partner (5%)</option>
            <option value="Storefront">Web Storefront (Direct)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs sm:text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All Statuses</option>
            <option value="Pending Verification">Pending Verification</option>
            <option value="Approved">Approved</option>
            <option value="Sent to Production">Sent to Production</option>
            <option value="Delivered">Delivered</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Order #</th>
                <th className="px-4 py-3">Channel / Partner</th>
                <th className="px-4 py-3">Client Organization</th>
                <th className="px-4 py-3">Product Summary</th>
                <th className="px-4 py-3">Gross Value</th>
                <th className="px-4 py-3">Margin %</th>
                <th className="px-4 py-3">Net Value</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                    {order.order_no}
                    <span className="block text-[11px] font-normal text-slate-400">{order.order_date}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{order.partner_name}</div>
                    <span className="inline-block text-[11px] font-medium text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded mt-0.5">
                      {order.partner_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                    {order.client_organization}
                  </td>
                  <td className="px-4 py-3 max-w-xs text-xs text-slate-600 truncate">
                    {order.product_summary}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                    ₹{order.gross_value.toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-amber-700">
                    {order.partner_margin_pct > 0 ? `${order.partner_margin_pct}% (-₹${order.partner_commission.toLocaleString('en-IN')})` : '0%'}
                  </td>
                  <td className="px-4 py-3 font-bold text-emerald-700 whitespace-nowrap">
                    ₹{order.net_amount.toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                        order.status === 'Approved'
                          ? 'bg-blue-100 text-blue-800'
                          : order.status === 'Delivered'
                          ? 'bg-emerald-100 text-emerald-800'
                          : order.status === 'Sent to Production'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      {order.status === 'Pending Verification' && (
                        <button
                          onClick={() => handleApprove(order.id)}
                          className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded transition-colors"
                        >
                          Approve
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedOrder(order)}
                        title="View Order Details"
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"
                      >
                        <Eye size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-semibold text-indigo-600 uppercase">{selectedOrder.order_no}</span>
                <h3 className="text-lg font-bold text-slate-900">{selectedOrder.client_organization}</h3>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 block">Channel Origin</span>
                  <span className="font-semibold text-slate-800">{selectedOrder.partner_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Tier Category</span>
                  <span className="font-semibold text-indigo-700">{selectedOrder.partner_type}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Order Date</span>
                  <span className="font-semibold text-slate-800">{selectedOrder.order_date}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Delivery SLA</span>
                  <span className="font-semibold text-slate-800">{selectedOrder.delivery_timeline}</span>
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase">Item Specification</span>
                <div className="text-slate-800 font-medium mt-0.5">{selectedOrder.product_summary}</div>
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Gross Order Value:</span>
                  <span className="font-semibold text-slate-800">₹{selectedOrder.gross_value.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-amber-700">
                  <span>Partner Margin / Commission ({selectedOrder.partner_margin_pct}%):</span>
                  <span className="font-semibold">-₹{selectedOrder.partner_commission.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-emerald-700 border-t border-slate-100 pt-1.5">
                  <span>Net Receivable:</span>
                  <span>₹{selectedOrder.net_amount.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Close
              </button>
              {selectedOrder.status === 'Pending Verification' && (
                <button
                  onClick={() => handleApprove(selectedOrder.id)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                >
                  Verify & Send to Production
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
