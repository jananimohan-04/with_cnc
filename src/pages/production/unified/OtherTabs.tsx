import React, { Component, useState, useEffect } from 'react';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge, ProgressBar, statusToVariant, Card } from '@/components/ui/Card';
import { Printer, Image as ImageIcon } from 'lucide-react';
import { BarChart, DonutChart } from '@/components/ui/Charts';
import { getMockImage } from '@/lib/mockStorage';

export function JobCardTab({ workOrders }: { workOrders: any[] }) {
  const columns: Column<any>[] = [
    { key: 'wo_no', label: 'WO No', sortable: true },
    { key: 'part_name', label: 'Part Name', sortable: true },
    { key: 'quantity', label: 'Target Qty', sortable: true },
    { key: 'start_date', label: 'Start Date' },
    { key: 'status', label: 'Status', render: (r) => <Badge variant={statusToVariant(r.status)}>{r.status}</Badge> },
    { key: 'actions', label: 'Actions', render: () => <button className="text-brand-600 flex items-center gap-1 text-sm font-medium"><Printer size={14}/> Print Job Card</button> }
  ];

  return (
    <div className="p-4">
      <DataTable data={workOrders} columns={columns} searchKeys={['wo_no', 'part_name']} />
    </div>
  );
}

export function WIPTab({ workOrders }: { workOrders: any[] }) {
  const wipOrders = workOrders.filter(w => w.status === 'In Progress');
  const [mockImages, setMockImages] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadImages = async () => {
      const loaded: Record<string, string> = {};
      for (const wo of wipOrders) {
        if (wo.part_name) {
          const u = await getMockImage(wo.part_name);
          if (u) loaded[wo.part_name] = u;
        }
      }
      setMockImages(loaded);
    };
    if (wipOrders.length > 0) loadImages();
  }, [wipOrders]);
  
  const columns: Column<any>[] = [
    { key: 'wo_no', label: 'WO No', sortable: true },
    { 
      key: 'customer', 
      label: 'Project', 
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-3">
          {r.image_url || r.drawing_url || mockImages[r.part_name] ? (
            <img src={r.image_url || r.drawing_url || mockImages[r.part_name]} alt="Part" className="w-8 h-8 rounded border border-slate-200 object-cover bg-white" />
          ) : (
            <div className="w-8 h-8 rounded border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400">
              <ImageIcon size={14} />
            </div>
          )}
          <span className="font-medium text-slate-700">{r.customer}</span>
        </div>
      ) 
    },
    { key: 'part_name', label: 'Part' },
    { key: 'quantity', label: 'Target Qty' },
    { key: 'completed', label: 'Completed', render: (r) => <span className="font-bold text-green-600">{r.completed}</span> },
    { 
      key: 'progress', 
      label: 'Progress', 
      render: (r) => {
        const pct = r.quantity > 0 ? Math.round((r.completed / r.quantity) * 100) : 0;
        return <ProgressBar value={pct} color="brand" height="h-2" />
      }
    }
  ];

  return (
    <div className="p-4">
      <DataTable data={wipOrders} columns={columns} searchKeys={['wo_no', 'customer', 'part_name']} />
    </div>
  );
}

export function CompletedTab({ workOrders }: { workOrders: any[] }) {
  const completedOrders = workOrders.filter(w => w.status === 'Completed');
  const [mockImages, setMockImages] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadImages = async () => {
      const loaded: Record<string, string> = {};
      for (const wo of completedOrders) {
        if (wo.part_name) {
          const u = await getMockImage(wo.part_name);
          if (u) loaded[wo.part_name] = u;
        }
      }
      setMockImages(loaded);
    };
    if (completedOrders.length > 0) loadImages();
  }, [completedOrders]);
  
  const columns: Column<any>[] = [
    { key: 'wo_no', label: 'WO No', sortable: true },
    { 
      key: 'customer', 
      label: 'Project', 
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-3">
          {r.image_url || r.drawing_url || mockImages[r.part_name] ? (
            <img src={r.image_url || r.drawing_url || mockImages[r.part_name]} alt="Part" className="w-8 h-8 rounded border border-slate-200 object-cover bg-white" />
          ) : (
            <div className="w-8 h-8 rounded border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400">
              <ImageIcon size={14} />
            </div>
          )}
          <span className="font-medium text-slate-700">{r.customer}</span>
        </div>
      ) 
    },
    { key: 'part_name', label: 'Part' },
    { key: 'quantity', label: 'Target Qty' },
    { key: 'completed', label: 'Produced Qty', render: (r) => <span className="font-bold text-green-600">{r.completed}</span> },
    { key: 'updated_at', label: 'Completed Date', render: (r) => <span>{new Date(r.updated_at || r.created_at).toLocaleDateString()}</span> }
  ];

  return (
    <div className="p-4">
      <DataTable data={completedOrders} columns={columns} searchKeys={['wo_no', 'customer', 'part_name']} />
    </div>
  );
}


class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-red-500 font-mono text-sm overflow-auto max-h-[400px]">
          <div className="font-bold">{this.state.error?.toString()}</div>
          <pre className="mt-2 text-xs">{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export function ReportsTab({ workOrders }: { workOrders: any[] }) {
  return (
    <ErrorBoundary>
      <ReportsTabContent workOrders={workOrders} />
    </ErrorBoundary>
  );
}

function ReportsTabContent({ workOrders }: { workOrders: any[] }) {
  // Simple aggregations for report
  const statusCounts = workOrders.reduce((acc, curr) => {
    const stat = curr.status || 'Unknown';
    acc[stat] = (acc[stat] || 0) + 1;
    return acc;
  }, {});

  const donutData = Object.keys(statusCounts).map(k => ({
    label: k, // fixed name to label
    value: statusCounts[k],
    color: k === 'Completed' ? '#10b981' : k === 'In Progress' ? '#f59e0b' : '#3b82f6'
  }));

  const monthCounts = workOrders.reduce((acc, curr) => {
    let month = 'Unknown';
    if (curr.created_at) {
      try {
        month = new Date(curr.created_at).toLocaleString('default', { month: 'short' });
      } catch (e) {
        month = 'Invalid';
      }
    }
    acc[month] = (acc[month] || 0) + 1;
    return acc;
  }, {});
  
  const barData = Object.keys(monthCounts).map(k => ({
    label: k, // fixed name to label for safety
    value: monthCounts[k]
  }));

  return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="p-4">
        <h4 className="font-semibold text-slate-800 mb-4">Orders by Status</h4>
        <DonutChart data={donutData} size={250} />
      </Card>
      
      <Card className="p-4">
        <h4 className="font-semibold text-slate-800 mb-4">Orders Created by Month</h4>
        <BarChart 
          data={barData} 
          height={250} 
          series={[{ key: 'value', label: 'Orders', color: '#4f46e5' }]} 
        />
      </Card>
    </div>
  );
}
