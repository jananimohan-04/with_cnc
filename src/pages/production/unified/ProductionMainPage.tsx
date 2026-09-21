import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Card';
import { Modal, FormField, inputClass } from '@/components/ui/Modal';
import { Plus } from 'lucide-react';

import { SummaryCards } from './SummaryCards';
import { ProductionOrdersTab } from './ProductionOrdersTab';
import { PartRoutingTab } from './PartRoutingTab';
import { LiveProductionTab } from './LiveProductionTab';
import { JobCardTab, WIPTab, CompletedTab, ReportsTab } from './OtherTabs';

export function ProductionMainPage() {
  const TABS = [
    'Production Orders', 'Part Routing', 'Live Production', 
    'Job Card', 'WIP', 'Completed', 'Reports'
  ];
  
  const [activeTab, setActiveTab] = useState('Production Orders');
  const [loading, setLoading] = useState(true);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [showNewWO, setShowNewWO] = useState(false);

  const fetchWorkOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('cnc_work_orders').select('*').order('created_at', { ascending: false });
    if (data) {
      setWorkOrders(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchWorkOrders();
  }, []);

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full">
      <PageHeader 
        title="Production" 
        description="Plan, track and manage production from project to part to finished goods." 
        actions={
          <div className="flex items-center gap-2">
            <Button variant="primary" className="gap-2" onClick={() => setShowNewWO(true)}>
              <Plus size={16} /> New Production Order
            </Button>
            <Button variant="secondary">Import</Button>
            <Button variant="secondary">Export</Button>
            <Button variant="secondary">Print</Button>
          </div>
        } 
      />

      <SummaryCards workOrders={workOrders} />

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-slate-200 mb-6 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab 
                ? 'border-brand-500 text-brand-600' 
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Dynamic Tab Content */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 min-h-[500px]">
        {activeTab === 'Production Orders' && <ProductionOrdersTab workOrders={workOrders} refresh={fetchWorkOrders} />}
        {activeTab === 'Part Routing' && <PartRoutingTab />}
        {activeTab === 'Live Production' && <LiveProductionTab workOrders={workOrders} />}
        {activeTab === 'Job Card' && <JobCardTab workOrders={workOrders} />}
        {activeTab === 'WIP' && <WIPTab workOrders={workOrders} />}
        {activeTab === 'Completed' && <CompletedTab workOrders={workOrders} />}
        {activeTab === 'Reports' && <ReportsTab workOrders={workOrders} />}
      </div>

      <Modal open={showNewWO} onClose={() => setShowNewWO(false)} title="New Production Order" subtitle="Create production from Sales Order" footer={
        <>
          <Button variant="secondary" onClick={() => setShowNewWO(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => setShowNewWO(false)}>Create Order</Button>
        </>
      }>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Link Sales Order" required>
            <select className={inputClass}><option>Select Sales Order...</option></select>
          </FormField>
          <FormField label="Customer">
            <input className={inputClass} readOnly placeholder="Auto-filled" />
          </FormField>
          <FormField label="Part Name">
            <input className={inputClass} readOnly placeholder="Auto-filled" />
          </FormField>
          <FormField label="Target Quantity">
            <input className={inputClass} readOnly placeholder="Auto-filled" />
          </FormField>
          <FormField label="Planned Start Date" required>
            <input type="date" className={inputClass} />
          </FormField>
          <FormField label="Planned End Date" required>
            <input type="date" className={inputClass} />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
