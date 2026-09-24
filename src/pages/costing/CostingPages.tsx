import { Calculator } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProjectCostingPage } from './ProjectCostingPage';

function CostingStub({ title, description }: { title: string, description: string }) {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title={title} description={description} />
      <div className="flex flex-col items-center justify-center h-64 border border-dashed border-slate-300 rounded-xl bg-slate-50">
        <Calculator className="text-slate-400 mb-3" size={32} />
        <h3 className="text-slate-700 font-medium">Costing Module</h3>
        <p className="text-slate-500 text-sm mt-1">{title} calculation engine coming soon.</p>
      </div>
    </div>
  );
}

export function MaterialCostPage() { return <CostingStub title="Material Cost" description="Standard and actual material costing" />; }
export function MachineCostPage() { return <CostingStub title="Machine Cost" description="Hourly machine rates and power consumption costs" />; }
export function LabourCostPage() { return <CostingStub title="Labour Cost" description="Direct and indirect labour rates" />; }
export function ToolingCostPage() { return <CostingStub title="Tooling Cost" description="Consumables, inserts, and fixture amortization" />; }
export function OverheadCostPage() { return <CostingStub title="Overhead Cost" description="Factory and administrative overheads" />; }

export function JobCostingPage() {
  return <ProjectCostingPage />;
}

export function QuoteCostingPage() { return <CostingStub title="Quotation Costing" description="Pre-production cost estimation for enquiries" />; }
