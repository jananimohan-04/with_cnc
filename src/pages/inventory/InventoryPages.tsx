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
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [rawMaterialsList, setRawMaterialsList] = useState<any[]>([]);
  const [selectedWo, setSelectedWo] = useState('');
  const [viewTarget, setViewTarget] = useState<any>(null);
  
  const resetForm = () => ({
    requestNo: `MR-2026-${Math.floor(1000 + Math.random() * 9000)}`,
    requestDate: new Date().toISOString().split('T')[0],
    requiredDate: '',
    priority: 'Normal',
    remarks: '',
    partName: '',
    productionQty: 0,
    items: [] as any[]
  });
  
  const [reqForm, setReqForm] = useState(resetForm());

  useEffect(() => {
    fetchRequests();
    fetchWorkOrders();
    fetchRawMaterials();
  }, []);

  async function fetchRequests() {
    setLoading(true);
    try {
       const { data } = await supabase.from('cnc_material_requests').select('*, items:cnc_material_request_items(*)').order('created_at', { ascending: false });
       if (data) setRequests(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }
  
  async function fetchWorkOrders() {
    const { data } = await supabase.from('cnc_work_orders').select('*').neq('status', 'Completed');
    if (data) setWorkOrders(data);
  }

  async function fetchRawMaterials() {
    const { data } = await supabase.from('cnc_raw_materials').select('*');
    if (data) setRawMaterialsList(data);
  }

  const handleWoChange = async (woId: string) => {
    setSelectedWo(woId);
    if (!woId) return;
    const wo = workOrders.find(w => w.id === woId);
    if (!wo) return;
    
    // Auto load from BOM
    const { data: bomData } = await supabase.from('cnc_bom').select('*').eq('parent_part_no', wo.part_no);
    
    const items = [];
    if (bomData && bomData.length > 0) {
       bomData.forEach((bom: any) => {
          const rm = rawMaterialsList.find(r => (r.name === bom.material || r.material_code === bom.material)) || {};
          items.push({
             id: crypto.randomUUID(),
             materialName: bom.material || '',
             materialCode: rm.material_code || '',
             requiredQty: Number(bom.quantity) * Number(wo.quantity),
             uom: bom.unit || 'Nos',
             availableStock: rm.stock_qty || 0,
             requestQty: Number(bom.quantity) * Number(wo.quantity),
             warehouse: rm.location || 'Main Warehouse',
             purpose: 'Production',
             remarks: ''
          });
       });
    }

    setReqForm({
       ...reqForm,
       partName: wo.part_name,
       productionQty: wo.quantity,
       items
    });
  };

  const handleAddItem = () => {
    setReqForm({
      ...reqForm,
      items: [...reqForm.items, { id: crypto.randomUUID(), materialName: '', materialCode: '', requiredQty: 0, uom: 'Nos', availableStock: 0, requestQty: 0, warehouse: 'Main Warehouse', purpose: 'Production', remarks: '' }]
    });
  };
  
  const updateItem = (id: string, field: string, val: any) => {
     setReqForm({
        ...reqForm,
        items: reqForm.items.map(i => i.id === id ? { ...i, [field]: val } : i)
     });
  };

  const handleSave = async () => {
     const wo = workOrders.find(w => w.id === selectedWo);
     if (!wo && reqForm.items.length === 0) return alert("Please select a Work Order or add materials manually.");
     
     const { data, error } = await supabase.from('cnc_material_requests').insert([{
        request_no: reqForm.requestNo,
        request_date: reqForm.requestDate,
        work_order_id: wo?.id || null,
        work_order_no: wo?.wo_no || 'MANUAL',
        part_name: wo?.part_name || reqForm.partName,
        production_qty: wo?.quantity || reqForm.productionQty,
        requested_by: 'Admin',
        required_date: reqForm.requiredDate || reqForm.requestDate,
        priority: reqForm.priority,
        remarks: reqForm.remarks,
        status: 'Pending'
     }]).select();

     if (error) { alert("Error: Make sure you ran the SQL to create cnc_material_requests! " + error.message); return; }
     
     if (data && data.length > 0) {
        const reqId = data[0].id;
        const itemsToInsert = reqForm.items.map(i => ({
           request_id: reqId,
           material_name: i.materialName,
           material_code: i.materialCode,
           required_qty: i.requiredQty,
           uom: i.uom,
           request_qty: i.requestQty,
           warehouse: i.warehouse,
           purpose: i.purpose,
           remarks: i.remarks
        }));
        await supabase.from('cnc_material_request_items').insert(itemsToInsert);
     }
     
     setShowAdd(false);
     setReqForm(resetForm());
     setSelectedWo('');
     fetchRequests();
  };

  const handleIssue = async (req: any) => {
     if (!confirm("Are you sure you want to issue these materials? This will deduct stock and create stock movements.")) return;
     
     for (const item of req.items) {
        // Find RM
        const { data: rmData } = await supabase.from('cnc_raw_materials').select('*').eq('name', item.material_name).limit(1);
        if (rmData && rmData.length > 0) {
           const rm = rmData[0];
           const newStock = Number(rm.stock_qty || 0) - Number(item.request_qty);
           await supabase.from('cnc_raw_materials').update({ stock_qty: newStock }).eq('id', rm.id);
        }
        
        // Stock Movement
        await supabase.from('cnc_stock_movements').insert([{
           date: new Date().toISOString().split('T')[0],
           type: 'Issue',
           material: item.material_name,
           qty: item.request_qty,
           uom: item.uom,
           from: item.warehouse || 'Main Warehouse',
           to: 'Shop Floor - ' + req.work_order_no,
           reference: req.request_no,
           user: 'Admin'
        }]);
     }
     
     await supabase.from('cnc_material_requests').update({ status: 'Issued' }).eq('id', req.id);
     fetchRequests();
  };

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader 
        title="Material Requests" 
        description="Manage production material requirements and stores issues" 
        actions={<Button onClick={() => { setReqForm(resetForm()); setSelectedWo(''); setShowAdd(true); }}><Plus size={16}/> Create Request</Button>}
      />

      <Card className="mb-6">
        <DataTable 
          data={requests}
          columns={[
            { key: 'request_no', label: 'Request No', render: (r) => <span className="font-mono text-brand-600 font-medium">{r.request_no}</span> },
            { key: 'work_order_no', label: 'Work Order', render: (r) => <span className="font-semibold">{r.work_order_no}</span> },
            { key: 'part_name', label: 'Part/Product' },
            { key: 'request_date', label: 'Date', render: (r) => new Date(r.request_date).toLocaleDateString() },
            { key: 'required_date', label: 'Required By', render: (r) => <span className={new Date(r.required_date) < new Date() && r.status === 'Pending' ? 'text-red-500 font-medium' : ''}>{new Date(r.required_date).toLocaleDateString()}</span> },
            { key: 'priority', label: 'Priority', render: (r) => <Badge variant={r.priority === 'Urgent' ? 'error' : r.priority === 'High' ? 'warning' : 'neutral'}>{r.priority}</Badge> },
            { key: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'Pending' ? 'warning' : r.status === 'Issued' ? 'success' : 'neutral'}>{r.status}</Badge> },
            { key: 'actions', label: 'Actions', align: 'right', render: (r) => (
                <div className="flex justify-end gap-2">
                   <Button variant="secondary" onClick={() => setViewTarget(r)}><Eye size={14}/></Button>
                   {r.status === 'Pending' && <Button variant="primary" onClick={() => handleIssue(r)}>Issue Stock</Button>}
                </div>
            ) }
          ]}
        />
      </Card>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="CREATE MATERIAL REQUEST" size="xl" footer={<><Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button><Button onClick={handleSave}>Submit Request</Button></>}>
         <div className="space-y-6">
            <div className="p-4 bg-brand-50 border border-brand-100 rounded-xl mb-4">
              <label className="block text-xs font-bold text-brand-700 uppercase mb-2">REQUEST FOR (WORK ORDER)</label>
              <select value={selectedWo} onChange={(e) => handleWoChange(e.target.value)} className={inputClass}>
                 <option value="">-- Select Work Order --</option>
                 {workOrders.map(w => (
                    <option key={w.id} value={w.id}>{w.wo_no} - {w.part_name} (Qty: {w.quantity})</option>
                 ))}
              </select>
              <p className="text-xs text-brand-600 mt-2">Selecting a Work Order automatically loads required materials from its BOM.</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
               <FormField label="Request No"><input type="text" className={inputClass} value={reqForm.requestNo} disabled /></FormField>
               <FormField label="Request Date"><input type="date" className={inputClass} value={reqForm.requestDate} disabled /></FormField>
               <FormField label="Required Date" required><input type="date" className={inputClass} value={reqForm.requiredDate} onChange={e => setReqForm({...reqForm, requiredDate: e.target.value})} /></FormField>
               <div className="space-y-1"><label className="text-xs font-medium text-slate-700">Priority</label><select value={reqForm.priority} onChange={e => setReqForm({...reqForm, priority: e.target.value})} className={inputClass}><option>Normal</option><option>High</option><option>Urgent</option></select></div>
               <FormField label="Part / Product"><input type="text" className={inputClass} value={reqForm.partName} onChange={e => setReqForm({...reqForm, partName: e.target.value})} /></FormField>
               <FormField label="Production Qty"><input type="number" className={inputClass} value={reqForm.productionQty.toString()} onChange={e => setReqForm({...reqForm, productionQty: Number(e.target.value)})} /></FormField>
               <FormField label="Requested By"><input type="text" className={inputClass} defaultValue="Admin" /></FormField>
               <FormField label="Remarks"><input type="text" className={inputClass} value={reqForm.remarks} onChange={e => setReqForm({...reqForm, remarks: e.target.value})} /></FormField>
            </div>

            <div>
               <div className="flex items-center justify-between mb-3">
                 <h3 className="text-sm font-bold text-slate-800">MATERIALS REQUIRED</h3>
                 <Button variant="secondary" onClick={handleAddItem}><Plus size={14}/> Add Material</Button>
               </div>
               
               <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                  <table className="w-full text-left text-sm">
                     <thead className="bg-slate-100 border-b border-slate-200 text-slate-600">
                        <tr>
                           <th className="p-3 font-semibold text-xs">Material / Component</th>
                           <th className="p-3 font-semibold text-xs">Code</th>
                           <th className="p-3 font-semibold text-xs text-right">Req Qty</th>
                           <th className="p-3 font-semibold text-xs text-right">Avail Stock</th>
                           <th className="p-3 font-semibold text-xs text-right">Request Qty</th>
                           <th className="p-3 font-semibold text-xs">UOM</th>
                           <th className="p-3 font-semibold text-xs">Warehouse</th>
                           <th className="p-3 font-semibold text-xs"></th>
                        </tr>
                     </thead>
                     <tbody>
                        {reqForm.items.length === 0 ? (
                           <tr><td colSpan={8} className="p-4 text-center text-slate-400">No materials loaded. Select a Work Order or add manually.</td></tr>
                        ) : reqForm.items.map((item, idx) => (
                           <tr key={item.id} className="border-b border-slate-100 last:border-0 bg-white">
                              <td className="p-2"><input type="text" value={item.materialName} onChange={e => updateItem(item.id, 'materialName', e.target.value)} className="w-full px-2 py-1 border border-slate-200 rounded text-sm outline-none focus:border-brand-500" placeholder="Material Name"/></td>
                              <td className="p-2"><input type="text" value={item.materialCode} onChange={e => updateItem(item.id, 'materialCode', e.target.value)} className="w-full px-2 py-1 border border-slate-200 rounded text-sm outline-none" placeholder="Code"/></td>
                              <td className="p-2"><input type="number" value={item.requiredQty} onChange={e => updateItem(item.id, 'requiredQty', e.target.value)} className="w-full px-2 py-1 border border-slate-200 rounded text-sm text-right outline-none bg-slate-50" readOnly={!!selectedWo}/></td>
                              <td className="p-2 text-right font-semibold text-slate-600">{item.availableStock}</td>
                              <td className="p-2"><input type="number" value={item.requestQty} onChange={e => updateItem(item.id, 'requestQty', e.target.value)} className={`w-full px-2 py-1 border border-slate-200 rounded text-sm text-right outline-none focus:border-brand-500 ${item.requestQty > item.availableStock ? 'border-red-500 bg-red-50 text-red-600 font-bold' : ''}`} /></td>
                              <td className="p-2"><input type="text" value={item.uom} onChange={e => updateItem(item.id, 'uom', e.target.value)} className="w-full px-2 py-1 border border-slate-200 rounded text-sm outline-none w-16" /></td>
                              <td className="p-2"><input type="text" value={item.warehouse} onChange={e => updateItem(item.id, 'warehouse', e.target.value)} className="w-full px-2 py-1 border border-slate-200 rounded text-sm outline-none" /></td>
                              <td className="p-2"><button onClick={() => setReqForm({...reqForm, items: reqForm.items.filter(i => i.id !== item.id)})} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={14}/></button></td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
         </div>
      </Modal>

      <Modal open={!!viewTarget} onClose={() => setViewTarget(null)} title={`MATERIAL REQUEST: ${viewTarget?.request_no}`} size="xl">
         {viewTarget && (
            <div className="space-y-6">
               <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div><p className="text-xs text-slate-500 font-medium">Work Order</p><p className="font-bold text-slate-800">{viewTarget.work_order_no}</p></div>
                  <div><p className="text-xs text-slate-500 font-medium">Part Name</p><p className="font-semibold text-slate-800">{viewTarget.part_name}</p></div>
                  <div><p className="text-xs text-slate-500 font-medium">Required By</p><p className="font-medium text-slate-800">{new Date(viewTarget.required_date).toLocaleDateString()}</p></div>
                  <div><p className="text-xs text-slate-500 font-medium">Status</p><Badge variant={viewTarget.status === 'Pending' ? 'warning' : 'success'}>{viewTarget.status}</Badge></div>
               </div>
               
               <div>
                  <h4 className="text-sm font-bold text-slate-800 mb-3">REQUESTED MATERIALS</h4>
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                     <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                           <tr>
                              <th className="p-3 font-semibold text-xs">Material / Component</th>
                              <th className="p-3 font-semibold text-xs">Code</th>
                              <th className="p-3 font-semibold text-xs text-right">Requested Qty</th>
                              <th className="p-3 font-semibold text-xs">UOM</th>
                              <th className="p-3 font-semibold text-xs">Warehouse</th>
                           </tr>
                        </thead>
                        <tbody>
                           {viewTarget.items?.map((item: any) => (
                              <tr key={item.id} className="border-b border-slate-100 last:border-0">
                                 <td className="p-3 font-medium text-slate-800">{item.material_name}</td>
                                 <td className="p-3 text-slate-600">{item.material_code || '-'}</td>
                                 <td className="p-3 text-right font-bold text-brand-600">{item.request_qty}</td>
                                 <td className="p-3 text-slate-600">{item.uom}</td>
                                 <td className="p-3 text-slate-600">{item.warehouse}</td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>
         )}
      </Modal>
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
