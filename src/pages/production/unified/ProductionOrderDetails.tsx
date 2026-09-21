import { Card, Badge, Button } from '@/components/ui/Card';
import { X, Play, Edit, Printer, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useState, useEffect } from 'react';
import { DonutChart, BarChart } from '@/components/ui/Charts';
import { getMockImage } from '@/lib/mockStorage';

export function ProductionOrderDetails({ order, onClose, refresh }: { order: any, onClose: () => void, refresh: () => void }) {
  const [routing, setRouting] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  
  useEffect(() => {
    async function loadDetails() {
      // Load routing for this part if available
      const { data: routeData } = await supabase.from('cnc_routing').select('*').eq('parent_part_no', order.part_no).order('op_no', { ascending: true });
      if (routeData) setRouting(routeData);

      // Load material issues
      const { data: matData } = await supabase.from('cnc_stock_movements').select('*').eq('reference', order.wo_no);
      if (matData) setMaterials(matData);
    }
    loadDetails();
  }, [order]);

  const qty = Number(order.quantity) || 0;
  const comp = Number(order.completed) || 0;
  const rej = Number(order.rejected) || 0;
  const pend = Math.max(0, qty - comp - rej);

  // Donut chart data
  const progressData = [
    { name: 'Completed', value: comp, color: '#10b981' },
    { name: 'In Progress', value: pend, color: '#f59e0b' },
    { name: 'Rejected', value: rej, color: '#ef4444' }
  ].filter(d => d.value > 0);
  
  if (progressData.length === 0) progressData.push({ name: 'Pending', value: qty, color: '#94a3b8' });

  // Target vs Actual chart (mocked over days for now since we don't have daily logs table)
  const targetVsActual = [
    { name: 'Day 1', target: qty * 0.2, actual: comp * 0.1 },
    { name: 'Day 2', target: qty * 0.5, actual: comp * 0.4 },
    { name: 'Day 3', target: qty * 0.8, actual: comp * 0.8 },
    { name: 'Day 4', target: qty, actual: comp },
  ];

  const handleStart = async () => {
    await supabase.from('cnc_work_orders').update({ status: 'In Progress' }).eq('id', order.id);
    refresh();
  };


  const handleViewDrawing = async () => {
    const url = order.image_url || order.drawing_url;
    if (url) {
      window.open(url, '_blank');
      return;
    }
    const mockUrl = await getMockImage(order.part_name);
    if (mockUrl) {
      window.open(mockUrl, '_blank');
    } else {
      alert("No drawing or image is attached to this part.");
    }
  };

  const handleEdit = async () => {
    const newQty = window.prompt(`Edit Target Quantity for ${order.wo_no}:`, order.quantity);
    if (newQty && !isNaN(Number(newQty))) {
      await supabase.from('cnc_work_orders').update({ quantity: Number(newQty) }).eq('id', order.id);
      refresh();
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (

    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          Production Details <Badge variant="neutral">{order.wo_no}</Badge>
        </h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Project Details & Actions */}
        <div className="space-y-6">
          <Card className="p-4">
            <h4 className="text-sm font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-2">Project & Part Details</h4>
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <div className="text-slate-500">Project / Customer</div><div className="font-medium text-slate-800">{order.customer}</div>
              <div className="text-slate-500">Sales Order</div><div className="text-slate-800">{order.sales_order || '-'}</div>
              <div className="text-slate-500">Part Name</div><div className="font-medium text-slate-800">{order.part_name}</div>
              <div className="text-slate-500">Part No / Rev</div><div className="text-slate-800">{order.part_no} / {order.drawing_revision || 'R0'}</div>
              <div className="text-slate-500">Target Qty</div><div className="font-bold text-slate-800">{qty} Nos</div>
              <div className="text-slate-500">Dates</div><div className="text-slate-800">{order.start_date} to {order.due_date}</div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2">
              <Button variant="secondary" className="flex-1 gap-2" onClick={handleViewDrawing}><FileText size={16} /> View Drawing</Button>
            </div>
          </Card>

          <Card className="p-4">
            <h4 className="text-sm font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-2">Production Actions</h4>
            <div className="flex flex-col gap-2">
              {order.status !== 'Completed' && (
                <Button variant="primary" className="w-full gap-2 justify-center" onClick={handleStart}>
                  <Play size={16} /> Start Production
                </Button>
              )}
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1 gap-2" onClick={handleEdit}><Edit size={16} /> Edit</Button>
                <Button variant="secondary" className="flex-1 gap-2" onClick={handlePrint}><Printer size={16} /> Print Job Card</Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Middle Column: Routing & WIP */}
        <div className="space-y-6">
          <Card className="p-4">
            <h4 className="text-sm font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-2">Process Routing</h4>
            {routing.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {routing.map((rt: any) => (
                  <div key={rt.id} className="py-2 flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium text-slate-800">Op {rt.op_no}: {rt.operation}</span>
                      <p className="text-xs text-slate-500">{rt.machine}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500">{rt.cycle_time} min/pc</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 py-4 text-center">No routing defined for this part.</p>
            )}
          </Card>

          <Card className="p-4">
            <h4 className="text-sm font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-2">Material Issue (Raw Material)</h4>
            {materials.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {materials.map((m: any) => (
                  <div key={m.id} className="py-2 flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium text-slate-800">{m.material}</span>
                      <p className="text-xs text-slate-500">{new Date(m.date).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-medium text-slate-800">{m.qty} {m.uom}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 py-4 text-center">No material issued yet.</p>
            )}
          </Card>
        </div>

        {/* Right Column: Progress & Charts */}
        <div className="space-y-6">
          <Card className="p-4">
            <h4 className="text-sm font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-2">Production Progress</h4>
            <div className="flex flex-col items-center justify-center">
              <DonutChart data={progressData} height={180} />
              <div className="mt-4 grid grid-cols-3 w-full text-center text-sm gap-2">
                <div><p className="text-slate-500 text-xs">Target</p><p className="font-semibold text-slate-800">{qty}</p></div>
                <div><p className="text-slate-500 text-xs">Completed</p><p className="font-semibold text-green-600">{comp}</p></div>
                <div><p className="text-slate-500 text-xs">Pending</p><p className="font-semibold text-brand-600">{pend}</p></div>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <h4 className="text-sm font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-2">Target vs Actual</h4>
            <BarChart 
              data={targetVsActual} 
              height={200} 
              series={[
                { key: 'target', label: 'Target', color: '#94a3b8' },
                { key: 'actual', label: 'Actual', color: '#10b981' }
              ]} 
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
