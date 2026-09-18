import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader, DateSelector, FilterButton, ExportButton } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge, StatCard, statusToVariant } from '@/components/ui/Card';
import { FileText, Eye, Edit, Truck } from 'lucide-react';

export function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);

  useEffect(() => {
    async function fetchDeliveries() {
      try {
        const { data, error } = await supabase.from('cnc_deliveries').select('*').order('created_at', { ascending: false });
        if (error) {
          console.error('Error fetching deliveries:', error);
          setDbError(true);
        } else if (data) {
          setDbError(false);
          const formattedData = data.map((d: any) => ({
            id: d.id,
            deliveryNo: d.delivery_no,
            orderNo: d.sales_order_no,
            customer: d.customer_name,
            partName: d.part_name,
            quantity: d.quantity,
            dispatchDate: d.delivery_date, // use delivery_date as placeholder
            expectedDelivery: d.delivery_date,
            carrier: d.transport,
            trackingNo: d.vehicle_no,
            status: d.status,
          }));
          setDeliveries(formattedData);
        }
      } catch (err) {
        console.error('Unexpected error:', err);
        setDbError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchDeliveries();
  }, []);

  const columns: Column<any>[] = [
    { key: 'deliveryNo', label: 'Delivery No', sortable: true, render: (r) => <span className="font-mono text-xs text-slate-700">{r.deliveryNo}</span> },
    { key: 'orderNo', label: 'Order No', sortable: true, render: (r) => <span className="font-mono text-xs text-slate-500">{r.orderNo}</span> },
    { key: 'customer', label: 'Customer', sortable: true, render: (r) => <span className="font-medium text-slate-700">{r.customer}</span> },
    { key: 'partName', label: 'Part' },
    { key: 'quantity', label: 'Qty', align: 'right' },
    { key: 'dispatchDate', label: 'Dispatched', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.dispatchDate || '-'}</span> },
    { key: 'expectedDelivery', label: 'Expected', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.expectedDelivery || '-'}</span> },
    { key: 'carrier', label: 'Carrier', render: (r) => <span className="text-xs">{r.carrier || '-'}</span> },
    { key: 'trackingNo', label: 'Tracking', render: (r) => <span className="font-mono text-xs text-slate-500">{r.trackingNo || '-'}</span> },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge variant={statusToVariant(r.status)} dot>{r.status}</Badge> },
  ];

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Delivery Tracking" description="Track dispatches and deliveries to customers" actions={<div className="flex items-center gap-2">{dbError && <Badge variant="error">DB Disconnected</Badge>}{loading && <Badge variant="neutral">Syncing...</Badge>}<FilterButton /><ExportButton /><DateSelector /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Shipments" value={deliveries.length.toString()} icon={<Truck size={20} />} accent="brand" />
        <StatCard label="In Transit" value={deliveries.filter(d => d.status === 'In Transit').length.toString()} icon={<Truck size={20} />} accent="accent" />
        <StatCard label="Delivered" value={deliveries.filter(d => d.status === 'Delivered').length.toString()} icon={<Truck size={20} />} accent="success" />
        <StatCard label="Delayed" value={deliveries.filter(d => d.status === 'Delayed').length.toString()} icon={<Truck size={20} />} accent="error" />
      </div>
      <DataTable data={deliveries} columns={columns} searchKeys={['deliveryNo', 'orderNo', 'customer', 'partName', 'trackingNo']} filterOptions={[{ label: 'Pending', value: 'Pending' }, { label: 'Dispatched', value: 'Dispatched' }, { label: 'In Transit', value: 'In Transit' }, { label: 'Delivered', value: 'Delivered' }, { label: 'Delayed', value: 'Delayed' }]} />
    </div>
  );
}
