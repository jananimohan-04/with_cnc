import { StatCard } from '@/components/ui/Card';
import { ClipboardList, Package, Clock, AlertTriangle, CheckCircle } from 'lucide-react';

export function SummaryCards({ workOrders }: { workOrders: any[] }) {
  const totalOrders = workOrders.length;
  const partsInProduction = workOrders.filter(w => w.status === 'In Progress').length;
  
  // Calculate Delayed Orders
  const delayedOrders = workOrders.filter(w => {
    if (w.status === 'Completed' || !w.due_date) return false;
    return new Date(w.due_date) < new Date();
  }).length;

  const completedThisMonth = workOrders.filter(w => {
    if (w.status !== 'Completed' || !w.updated_at) return false;
    const updateDate = new Date(w.updated_at);
    const now = new Date();
    return updateDate.getMonth() === now.getMonth() && updateDate.getFullYear() === now.getFullYear();
  }).length;

  // On Time completion (just a heuristic percentage for completed items)
  const completedItems = workOrders.filter(w => w.status === 'Completed');
  const onTimeItems = completedItems.filter(w => {
    if (!w.due_date || !w.updated_at) return true;
    return new Date(w.updated_at) <= new Date(w.due_date);
  });
  
  const onTimePercentage = completedItems.length > 0 
    ? Math.round((onTimeItems.length / completedItems.length) * 100)
    : 100;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      <StatCard 
        label="Total Production Orders" 
        value={totalOrders.toString()} 
        icon={<ClipboardList size={20} />} 
        accent="neutral" 
      />
      <StatCard 
        label="Parts in Production" 
        value={partsInProduction.toString()} 
        icon={<Package size={20} />} 
        accent="brand" 
      />
      <StatCard 
        label="On Time Completion" 
        value={`${onTimePercentage}%`} 
        icon={<Clock size={20} />} 
        accent="success" 
      />
      <StatCard 
        label="Delayed Orders" 
        value={delayedOrders.toString()} 
        icon={<AlertTriangle size={20} />} 
        accent="error" 
      />
      <StatCard 
        label="Completed This Month" 
        value={completedThisMonth.toString()} 
        icon={<CheckCircle size={20} />} 
        accent="success" 
      />
    </div>
  );
}
