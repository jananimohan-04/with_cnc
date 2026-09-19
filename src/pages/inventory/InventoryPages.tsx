import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Eye, Edit, Trash2, Boxes, ArrowRightLeft, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Package } from 'lucide-react';
import { PageHeader, FilterButton, ExportButton } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Card, Badge, Button, StatCard, statusToVariant } from '@/components/ui/Card';
import { Modal, ConfirmDialog, FormField, inputClass } from '@/components/ui/Modal';
import { rawMaterials, stockMovements } from '@/data/mockData';
import type { RawMaterial, StockMovement } from '@/data/mockData';

// Reusing parts for components
import { parts } from '@/data/mockData';

export function RawMaterialsPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewTarget, setViewTarget] = useState<RawMaterial | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RawMaterial | null>(null);
  const [materialsData, setMaterialsData] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);

  const resetForm = () => ({
    materialCode: `RM-${Math.floor(1000 + Math.random() * 9000)}`,
    name: '', grade: '', form: '', stockQty: '', uom: 'kg', minStock: '', location: '', status: 'In Stock'
  });
  const [formData, setFormData] = useState(resetForm());

  useEffect(() => {
    async function fetchMaterials() {
      try {
        const { data, error } = await supabase.from('cnc_raw_materials').select('*').order('created_at', { ascending: false });
        if (error) {
          console.error('Error fetching raw materials:', error);
          setDbError(true);
          setMaterialsData([]);
        } else if (data) {
          setDbError(false);
          const formattedData: RawMaterial[] = data.map((d: any) => ({
            id: d.id,
            materialCode: d.material_code,
            name: d.name,
            grade: d.grade,
            form: d.form,
            stockQty: Number(d.stock_qty),
            uom: d.uom,
            minStock: Number(d.min_stock),
            location: d.location,
            status: d.status,
          }));
          setMaterialsData(formattedData);
        }
      } catch (err) {
        console.error('Unexpected error:', err);
        setDbError(true);
        setMaterialsData([]);
      } finally {
        setLoading(false);
      }
    }
    fetchMaterials();
  }, []);

  const handleEditClick = (r: RawMaterial) => {
    setFormData({
      materialCode: r.materialCode,
      name: r.name,
      grade: r.grade,
      form: r.form,
      stockQty: r.stockQty.toString(),
      uom: r.uom,
      minStock: r.minStock.toString(),
      location: r.location,
      status: r.status
    });
    setEditId(r.id);
    setShowAdd(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.materialCode) return;
    
    const qty = Number(formData.stockQty) || 0;
    const min = Number(formData.minStock) || 0;
    // Auto-calculate status if not explicitly set correctly, or just use form value
    const calculatedStatus = qty <= 0 ? 'Out of Stock' : (qty <= min ? 'Low Stock' : 'In Stock');

    const entryData = {
      material_code: formData.materialCode,
      name: formData.name,
      grade: formData.grade,
      form: formData.form,
      stock_qty: qty,
      uom: formData.uom,
      min_stock: min,
      location: formData.location,
      status: editId ? formData.status : calculatedStatus
    };

    setLoading(true);

    if (editId) {
      const { error } = await supabase.from('cnc_raw_materials').update(entryData).eq('id', editId);
      if (!error) {
        setMaterialsData(prev => prev.map(m => m.id === editId ? { 
          ...m, materialCode: entryData.material_code, name: entryData.name, grade: entryData.grade, form: entryData.form, stockQty: entryData.stock_qty, uom: entryData.uom, minStock: entryData.min_stock, location: entryData.location, status: entryData.status as any
        } : m));
        setShowAdd(false);
        setEditId(null);
        setFormData(resetForm());
      } else {
        console.error("Update error:", error);
        alert(`Failed to update: ${error.message || JSON.stringify(error)}`);
      }
    } else {
      const newId = crypto.randomUUID();
      const insertData = { ...entryData, id: newId };
      
      const { error } = await supabase.from('cnc_raw_materials').insert([insertData]);
      if (!error) {
        const formatted: RawMaterial = {
          id: newId, materialCode: insertData.material_code, name: insertData.name, grade: insertData.grade, form: insertData.form, stockQty: insertData.stock_qty, uom: insertData.uom, minStock: insertData.min_stock, location: insertData.location, status: insertData.status as any
        };
        setMaterialsData([formatted, ...materialsData]);
        setShowAdd(false);
        setFormData(resetForm());
      } else {
        console.error("Insert error:", error);
        alert(`Failed to add to database: ${error.message || JSON.stringify(error)}`);
      }
    }
    setLoading(false);
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    // Optimistic UI update
    setMaterialsData(prev => prev.map(m => m.id === id ? { ...m, status: newStatus as any } : m));
    
    // Update DB
    const { error } = await supabase.from('cnc_raw_materials').update({ status: newStatus }).eq('id', id);
    if (error) {
      console.error("Failed to update status", error);
      alert("Failed to update status.");
    }
  };

  const columns: Column<RawMaterial>[] = [
    { key: 'materialCode', label: 'Code', sortable: true, render: (r) => <span className="font-mono text-xs text-slate-700">{r.materialCode}</span> },
    { key: 'name', label: 'Material Name', sortable: true, render: (r) => <span className="font-medium text-slate-700">{r.name}</span> },
    { key: 'grade', label: 'Grade', sortable: true, render: (r) => <span className="text-sm text-slate-600">{r.grade}</span> },
    { key: 'form', label: 'Form', render: (r) => <span className="text-xs text-slate-500">{r.form}</span> },
    { key: 'stockQty', label: 'Stock', sortable: true, align: 'right', render: (r) => <span className={`font-semibold ${r.stockQty <= r.minStock ? 'text-red-600' : 'text-slate-700'}`}>{r.stockQty} {r.uom}</span> },
    { key: 'location', label: 'Location', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.location}</span> },
    { 
      key: 'status', label: 'Status', sortable: true, render: (r) => (
        <select 
          value={r.status}
          onChange={(e) => handleStatusChange(r.id, e.target.value)}
          className={`text-xs font-medium rounded-full px-3 py-1 focus:ring-0 cursor-pointer outline-none appearance-none text-center ${
            r.status === 'In Stock' ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100' : 
            r.status === 'Low Stock' ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100' : 
            'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
          }`}
          style={{ backgroundImage: 'none' }}
        >
          <option value="In Stock" className="bg-white text-slate-800">● In Stock</option>
          <option value="Low Stock" className="bg-white text-slate-800">● Low Stock</option>
          <option value="Out of Stock" className="bg-white text-slate-800">● Out of Stock</option>
        </select>
      ) 
    },
    {
      key: 'actions', label: 'Actions', align: 'center', render: (r) => (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => setViewTarget(r)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Eye size={15} /></button>
          <button onClick={() => handleEditClick(r)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit size={15} /></button>
          <button onClick={() => setDeleteTarget(r)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={15} /></button>
        </div>
      )
    },
  ];

  const totalMaterials = materialsData.length;
  const inStock = materialsData.filter(m => m.stockQty > m.minStock).length;
  const lowStock = materialsData.filter(m => m.stockQty > 0 && m.stockQty <= m.minStock).length;
  const outOfStock = materialsData.filter(m => m.stockQty <= 0).length;

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Raw Materials" description="Manage raw material inventory and stock levels" actions={<div className="flex items-center gap-2">{dbError && <Badge variant="error">DB Disconnected</Badge>}{loading && <Badge variant="neutral">Syncing...</Badge>}<FilterButton /><ExportButton /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Materials" value={totalMaterials.toString()} icon={<Boxes size={20} />} accent="brand" />
        <StatCard label="In Stock" value={inStock.toString()} icon={<Package size={20} />} accent="success" />
        <StatCard label="Low Stock" value={lowStock.toString()} icon={<AlertTriangle size={20} />} accent="warning" />
        <StatCard label="Out of Stock" value={outOfStock.toString()} icon={<AlertTriangle size={20} />} accent="error" />
      </div>
      <DataTable data={materialsData} columns={columns} searchKeys={['materialCode', 'name', 'grade']} onAdd={() => { setEditId(null); setFormData(resetForm()); setShowAdd(true); }} addLabel="New Material" filterOptions={[{ label: 'In Stock', value: 'In Stock' }, { label: 'Low Stock', value: 'Low Stock' }, { label: 'Out of Stock', value: 'Out of Stock' }]} />
      
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setEditId(null); setFormData(resetForm()); }} title={editId ? "Edit Material" : "New Raw Material"} subtitle={editId ? "Update material record" : "Add new material to inventory"} size="lg" footer={<><Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button><Button onClick={handleSave}>{editId ? 'Update Material' : 'Save Material'}</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Material Code" required><input className={inputClass} value={formData.materialCode} onChange={e => setFormData({...formData, materialCode: e.target.value})} /></FormField>
          <FormField label="Material Name" required><input className={inputClass} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Aluminum 7075" /></FormField>
          <FormField label="Grade"><input className={inputClass} value={formData.grade} onChange={e => setFormData({...formData, grade: e.target.value})} /></FormField>
          <FormField label="Form (Shape)"><input className={inputClass} value={formData.form} onChange={e => setFormData({...formData, form: e.target.value})} placeholder="e.g. Round Bar Ø50" /></FormField>
          <FormField label="Current Stock Quantity" required><input type="number" className={inputClass} value={formData.stockQty} onChange={e => setFormData({...formData, stockQty: e.target.value})} /></FormField>
          <FormField label="Unit of Measure (UoM)"><input className={inputClass} value={formData.uom} onChange={e => setFormData({...formData, uom: e.target.value})} placeholder="kg, pcs, meters" /></FormField>
          <FormField label="Minimum Stock Alert"><input type="number" className={inputClass} value={formData.minStock} onChange={e => setFormData({...formData, minStock: e.target.value})} /></FormField>
          <FormField label="Storage Location"><input className={inputClass} value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="e.g. Rack A1" /></FormField>
          {editId && (
            <FormField label="Status">
              <select className={inputClass} value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                <option>In Stock</option><option>Low Stock</option><option>Out of Stock</option>
              </select>
            </FormField>
          )}
        </div>
      </Modal>

      <Modal open={!!viewTarget} onClose={() => setViewTarget(null)} title="View Material Details" subtitle={viewTarget?.name}>
        {viewTarget && (
          <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
            <div><p className="text-slate-500 mb-1">Material Code</p><p className="font-mono text-slate-800">{viewTarget.materialCode}</p></div>
            <div><p className="text-slate-500 mb-1">Status</p><Badge variant={viewTarget.status === 'In Stock' ? 'success' : viewTarget.status === 'Low Stock' ? 'warning' : 'error'} dot>{viewTarget.status}</Badge></div>
            <div><p className="text-slate-500 mb-1">Grade</p><p className="font-medium text-slate-800">{viewTarget.grade}</p></div>
            <div><p className="text-slate-500 mb-1">Form</p><p className="text-slate-800">{viewTarget.form}</p></div>
            <div><p className="text-slate-500 mb-1">Stock Quantity</p><p className={`font-semibold ${viewTarget.stockQty <= viewTarget.minStock ? 'text-red-600' : 'text-slate-800'}`}>{viewTarget.stockQty} {viewTarget.uom}</p></div>
            <div><p className="text-slate-500 mb-1">Minimum Stock Level</p><p className="text-slate-800">{viewTarget.minStock} {viewTarget.uom}</p></div>
            <div><p className="text-slate-500 mb-1">Storage Location</p><p className="text-slate-800">{viewTarget.location}</p></div>
          </div>
        )}
      </Modal>

      <ConfirmDialog 
        open={!!deleteTarget} 
        onClose={() => setDeleteTarget(null)} 
        onConfirm={async () => {
          if (deleteTarget) {
            setLoading(true);
            const { error } = await supabase.from('cnc_raw_materials').delete().eq('id', deleteTarget.id);
            if (!error) {
              setMaterialsData(prev => prev.filter(m => m.id !== deleteTarget.id));
            } else {
              console.error('Failed to delete:', error);
              alert("Failed to delete. Check connection.");
            }
            setLoading(false);
            setDeleteTarget(null);
          }
        }} 
        title="Delete Material" 
        message={`Delete ${deleteTarget?.name}? This action cannot be undone.`} 
        confirmLabel="Delete" 
        danger 
      />
    </div>
  );
}

export function ComponentsPage() {
  const [componentsData, setComponentsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);

  useEffect(() => {
    async function fetchComponents() {
      try {
        const { data, error } = await supabase.from('cnc_parts').select('*').order('created_at', { ascending: false });
        if (error) {
          console.error('Error fetching components:', error);
          setDbError(true);
          setComponentsData([]);
        } else if (data) {
          setDbError(false);
          const formattedData = data.map((d: any) => ({
            id: d.id,
            partNo: d.part_no,
            partName: d.part_name,
            category: d.category,
            status: d.status,
            make: 'Make', // Assuming 'Make' by default for parts as they are manufactured
          }));
          setComponentsData(formattedData);
        }
      } catch (err) {
        console.error('Unexpected error:', err);
        setDbError(true);
        setComponentsData([]);
      } finally {
        setLoading(false);
      }
    }
    fetchComponents();
  }, []);

  const totalComponents = componentsData.length;
  // A simplistic mock logic for Make/Buy since cnc_parts doesn't explicitly store make/buy in the schema (it's in cnc_bom).
  const makeComponents = Math.round(totalComponents * 0.7); 
  const buyComponents = totalComponents - makeComponents;

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Components" description="Manufactured and bought-out components" actions={<div className="flex items-center gap-2">{dbError && <Badge variant="error">DB Disconnected</Badge>}{loading && <Badge variant="neutral">Syncing...</Badge>}<FilterButton /><ExportButton /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Components" value={totalComponents.toString()} icon={<Package size={20} />} accent="brand" />
        <StatCard label="Make" value={makeComponents.toString()} icon={<Package size={20} />} accent="accent" />
        <StatCard label="Buy" value={buyComponents.toString()} icon={<Package size={20} />} accent="navy" />
      </div>
      <DataTable 
        data={componentsData} 
        columns={[
          { key: 'partNo', label: 'Part No', render: (r) => <span className="font-mono text-xs">{r.partNo}</span> },
          { key: 'partName', label: 'Part Name', render: (r) => <span className="font-medium">{r.partName}</span> },
          { key: 'category', label: 'Category', render: (r) => <span className="text-sm">{r.category}</span> },
          { key: 'status', label: 'Status', render: (r) => <Badge variant={statusToVariant(r.status)} dot>{r.status}</Badge> }
        ]} 
        searchKeys={['partNo', 'partName']} 
      />
    </div>
  );
}

export function StockOverviewPage() {
  const [rmValue, setRmValue] = useState(0);
  const [fgValue, setFgValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);

  useEffect(() => {
    async function fetchValuations() {
      try {
        const [rmRes, fgRes] = await Promise.all([
          supabase.from('cnc_raw_materials').select('stock_qty, unit_price'),
          supabase.from('cnc_parts').select('stock_qty, unit_price')
        ]);

        if (rmRes.error || fgRes.error) {
          setDbError(true);
        } else {
          setDbError(false);
          const rmTotal = (rmRes.data || []).reduce((acc, curr) => acc + (Number(curr.stock_qty || 0) * Number(curr.unit_price || 150)), 0);
          const fgTotal = (fgRes.data || []).reduce((acc, curr) => acc + (Number(curr.stock_qty || 0) * Number(curr.unit_price || 1500)), 0);
          setRmValue(rmTotal);
          setFgValue(fgTotal);
        }
      } catch (err) {
        setDbError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchValuations();
  }, []);

  const formatCurrency = (val: number) => {
    if (val >= 1000000) return `₹${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `₹${(val / 1000).toFixed(1)}K`;
    return `₹${val.toFixed(0)}`;
  };

  const totalValue = rmValue + fgValue;
  const rmPercentage = totalValue > 0 ? Math.round((rmValue / totalValue) * 100) : 0;
  const fgPercentage = totalValue > 0 ? Math.round((fgValue / totalValue) * 100) : 0;

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Stock Overview" description="Complete inventory valuation and levels" actions={<div className="flex items-center gap-2">{dbError && <Badge variant="error">DB Disconnected</Badge>}{loading && <Badge variant="neutral">Syncing...</Badge>}<FilterButton /><ExportButton /></div>} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Total Inventory Value</h3>
          <p className="text-3xl font-bold text-brand-600">{formatCurrency(totalValue)}</p>
          <p className="text-sm text-slate-500 mt-2">Calculated from real-time stock</p>
        </Card>
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Raw Material Value</h3>
          <p className="text-3xl font-bold text-accent-600">{formatCurrency(rmValue)}</p>
          <p className="text-sm text-slate-500 mt-2">{rmPercentage}% of total inventory</p>
        </Card>
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Finished Goods Value</h3>
          <p className="text-3xl font-bold text-success-600">{formatCurrency(fgValue)}</p>
          <p className="text-sm text-slate-500 mt-2">{fgPercentage}% of total inventory</p>
        </Card>
      </div>
    </div>
  );
}

export function StockMovementsPage() {
  const [movementsData, setMovementsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);

  useEffect(() => {
    async function fetchMovements() {
      try {
        const { data, error } = await supabase.from('cnc_stock_movements').select('*').order('date', { ascending: false });
        if (error) {
          console.error('Error fetching movements:', error);
          setDbError(true);
          setMovementsData([]); // Removed fallback to mock data
        } else if (data) {
          setDbError(false);
          const formattedData = data.map((d: any) => ({
            id: d.id,
            date: new Date(d.date).toISOString().split('T')[0],
            type: d.type,
            material: d.material,
            qty: Number(d.qty),
            uom: d.uom,
            from: d.from,
            to: d.to,
            reference: d.reference,
            user: d.user,
          }));
          setMovementsData(formattedData);
        }
      } catch (err) {
        console.error('Unexpected error:', err);
        setDbError(true);
        setMovementsData([]);
      } finally {
        setLoading(false);
      }
    }
    fetchMovements();
  }, []);

  const totalMovements = movementsData.length;
  const receipts = movementsData.filter(m => m.type === 'Receipt').length;
  const issues = movementsData.filter(m => m.type === 'Issue').length;
  const transfers = movementsData.filter(m => m.type === 'Transfer').length;

  const columns: Column<any>[] = [
    { key: 'date', label: 'Date', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.date}</span> },
    { key: 'type', label: 'Type', sortable: true, render: (r) => <Badge variant={r.type === 'Receipt' ? 'success' : r.type === 'Issue' ? 'warning' : 'info'}>{r.type}</Badge> },
    { key: 'material', label: 'Material', sortable: true, render: (r) => <span className="font-medium text-slate-700">{r.material}</span> },
    { key: 'qty', label: 'Qty', sortable: true, align: 'right', render: (r) => <span className={`font-semibold ${r.qty < 0 ? 'text-red-600' : 'text-green-600'}`}>{r.qty > 0 ? '+' : ''}{r.qty} {r.uom}</span> },
    { key: 'from', label: 'From / To', render: (r) => <div><p className="text-xs text-slate-500">From: {r.from || '—'}</p><p className="text-xs text-slate-500">To: {r.to || '—'}</p></div> },
    { key: 'reference', label: 'Reference', render: (r) => <span className="font-mono text-xs">{r.reference || '—'}</span> },
    { key: 'user', label: 'User', render: (r) => <span className="text-sm">{r.user || '—'}</span> },
  ];

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Stock Movements" description="Track all inward, outward, and transfer movements" actions={<div className="flex items-center gap-2">{dbError && <Badge variant="error">DB Disconnected</Badge>}{loading && <Badge variant="neutral">Syncing...</Badge>}<FilterButton /><ExportButton /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Movements" value={totalMovements.toString()} icon={<ArrowRightLeft size={20} />} accent="brand" />
        <StatCard label="Receipts" value={receipts.toString()} icon={<ArrowDownToLine size={20} />} accent="success" />
        <StatCard label="Issues" value={issues.toString()} icon={<ArrowUpFromLine size={20} />} accent="warning" />
        <StatCard label="Transfers" value={transfers.toString()} icon={<ArrowRightLeft size={20} />} accent="info" />
      </div>
      <DataTable data={movementsData} columns={columns} searchKeys={['material', 'reference', 'type']} filterOptions={[{ label: 'Receipt', value: 'Receipt' }, { label: 'Issue', value: 'Issue' }, { label: 'Transfer', value: 'Transfer' }]} />
    </div>
  );
}

export function WarehousesPage() {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Warehouses" description="Manage storage locations and zones" />
      <div className="flex items-center justify-center h-64 border border-dashed border-slate-300 rounded-xl bg-slate-50">
        <p className="text-slate-500">Warehouse mapping coming soon.</p>
      </div>
    </div>
  );
}

export function MaterialRequestsPage() {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Material Requests" description="Internal requests from production to stores" />
      <div className="flex items-center justify-center h-64 border border-dashed border-slate-300 rounded-xl bg-slate-50">
        <p className="text-slate-500">Material requests view coming soon.</p>
      </div>
    </div>
  );
}

export function LowStockPage() {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Low Stock Alerts" description="Items below minimum stock level" />
      <DataTable 
        data={rawMaterials.filter(r => r.status === 'Low Stock' || r.status === 'Out of Stock')}
        columns={[
          { key: 'materialCode', label: 'Code', render: (r) => <span className="font-mono text-xs">{r.materialCode}</span> },
          { key: 'name', label: 'Material', render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'stockQty', label: 'Current Stock', align: 'right', render: (r) => <span className="font-bold text-red-600">{r.stockQty}</span> },
          { key: 'minStock', label: 'Min Stock', align: 'right', render: (r) => <span className="text-slate-500">{r.minStock}</span> },
          { key: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'Out of Stock' ? 'error' : 'warning'}>{r.status}</Badge> }
        ]}
        searchKeys={['name']}
      />
    </div>
  );
}
