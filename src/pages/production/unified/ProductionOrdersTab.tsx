import { useState, useEffect } from 'react';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge, ProgressBar, statusToVariant } from '@/components/ui/Card';
import { Eye, Edit, Image as ImageIcon } from 'lucide-react';
import { ProductionOrderDetails } from './ProductionOrderDetails';
import { getMockImage } from '@/lib/mockStorage';
import { supabase } from '@/lib/supabase';
import { Modal } from '@/components/ui/Modal';

const WO_STATUSES = ['Planning', 'In Progress', 'On Hold', 'Completed', 'Dispatched'];

export function ProductionOrdersTab({ workOrders, refresh }: { workOrders: any[], refresh: () => void }) {
  const [selectedWO, setSelectedWO] = useState<any | null>(null);

  const handleStatusChange = async (order: any, newStatus: string) => {
    if (order.status === newStatus) return;
    try {
      const { error } = await supabase.from('cnc_work_orders').update({ status: newStatus }).eq('id', order.id);
      if (error) throw error;
      refresh();
    } catch (err: any) {
      alert("Failed to update status: " + err.message);
    }
  };

  
  // Search and status filtering are handled by DataTable itself
  const [mockImages, setMockImages] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadImages = async () => {
      const loaded: Record<string, string> = {};
      for (const wo of workOrders) {
        if (wo.part_name) {
          const u = await getMockImage(wo.part_name).catch(() => null);
          if (u) loaded[wo.part_name] = u;
        }
      }
      setMockImages(loaded);
    };
    if (workOrders.length > 0) loadImages();
  }, [workOrders]);


  const columns: Column<any>[] = [
    { key: 'wo_no', label: 'WO No', sortable: true, render: (r) => <span className="font-mono text-xs text-slate-700">{r.wo_no}</span> },
    { 
      key: 'customer', 
      label: 'Project', 
      sortable: true, 
      render: (r) => (
        <div className="flex items-center gap-3">
          {r.image_url || r.drawing_url || mockImages[r.part_name] ? (
            <img src={r.image_url || r.drawing_url || mockImages[r.part_name]} alt="Part" className="w-12 h-12 rounded border border-slate-200 object-cover bg-white" />
          ) : (
            <div className="w-12 h-12 rounded border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400">
              <ImageIcon size={20} />
            </div>
          )}
          <span className="text-sm font-medium text-slate-700">{r.customer}</span>
        </div>
      ) 
    },
    { key: 'part_name', label: 'Part Name', sortable: true, render: (r) => <span className="text-sm text-slate-600">{r.part_name}</span> },
    { key: 'quantity', label: 'Qty', sortable: true, align: 'right', render: (r) => <span className="text-sm text-slate-700">{r.quantity}</span> },
    { key: 'start_date', label: 'Planned Start', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.start_date}</span> },
    { key: 'due_date', label: 'Planned End', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.due_date}</span> },
    { 
      key: 'progress', 
      label: 'Progress', 
      render: (r) => {
        const qty = Number(r.quantity) || 0;
        const comp = Number(r.completed) || 0;
        const pct = qty > 0 ? Math.min(100, Math.round((comp / qty) * 100)) : 0;
        return (
          <div className="w-full flex items-center gap-2">
            <ProgressBar value={pct} color={pct === 100 ? 'success' : pct > 0 ? 'brand' : 'neutral'} height="h-1.5" />
            <span className="text-xs text-slate-500 w-8">{pct}%</span>
          </div>
        );
      }
    },
    { key: 'status', label: 'Status', sortable: true, render: (r) => (
        <div className="relative inline-block w-full text-center">
          <select 
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            value={r.status}
            onChange={(e) => handleStatusChange(r, e.target.value)}
          >
            {r.status && !WO_STATUSES.includes(r.status) && <option value={r.status}>{r.status}</option>}
            {WO_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <Badge variant={statusToVariant(r.status)} dot>{r.status}</Badge>
        </div>
      ) },
    { 
      key: 'actions', 
      label: 'Actions', 
      align: 'center', 
      render: (r) => (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => setSelectedWO(r)} title="View Details" className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Eye size={15} /></button>
          <button onClick={() => setSelectedWO(r)} title="Edit Order" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit size={15} /></button>
        </div>
      ) 
    }
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Table section */}
      <div className="p-4">
        <DataTable 
          data={workOrders}
          columns={columns} 
          searchKeys={['wo_no', 'customer', 'part_name']}
          filterOptions={WO_STATUSES.map(s => ({ label: s, value: s }))}
        />
      </div>

      {/* Details Section */}
      <Modal open={!!selectedWO} onClose={() => setSelectedWO(null)} title={selectedWO ? `Production Details: ${selectedWO.wo_no}` : ''} size="xl">
        {selectedWO && (
          <ProductionOrderDetails order={selectedWO} onClose={() => setSelectedWO(null)} refresh={refresh} />
        )}
      </Modal>
    </div>
  );
}
