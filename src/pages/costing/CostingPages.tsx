import { Calculator, BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';

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
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Job Costing" description="Detailed cost breakdown for completed jobs" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-3">Cost Breakdown: WO-2026-0847</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-slate-600">Material Cost</span>
              <span className="font-mono text-slate-800 font-medium">₹ 1,25,000</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">Machine Cost (120 hrs)</span>
              <span className="font-mono text-slate-800 font-medium">₹ 60,000</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">Labour Cost</span>
              <span className="font-mono text-slate-800 font-medium">₹ 24,000</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">Tooling Cost</span>
              <span className="font-mono text-slate-800 font-medium">₹ 12,500</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">Overhead (15%)</span>
              <span className="font-mono text-slate-800 font-medium">₹ 33,225</span>
            </div>
            <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
              <span className="text-lg font-bold text-slate-800">Total Manufacturing Cost</span>
              <span className="text-lg font-mono font-bold text-brand-600">₹ 2,54,725</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function QuoteCostingPage() { return <CostingStub title="Quotation Costing" description="Pre-production cost estimation for enquiries" />; }
