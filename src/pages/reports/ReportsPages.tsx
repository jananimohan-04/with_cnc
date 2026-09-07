import { BarChart3, TrendingUp, Filter } from 'lucide-react';
import { PageHeader, DateSelector } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';

function ReportStub({ title, description }: { title: string, description: string }) {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title={title} description={description} actions={<DateSelector />} />
      <div className="flex flex-col items-center justify-center h-64 border border-dashed border-slate-300 rounded-xl bg-slate-50">
        <BarChart3 className="text-slate-400 mb-3" size={32} />
        <h3 className="text-slate-700 font-medium">Analytics Engine</h3>
        <p className="text-slate-500 text-sm mt-1">{title} generation coming soon.</p>
      </div>
    </div>
  );
}

export function ProductionReportsPage() { return <ReportStub title="Production Reports" description="Output, efficiency, and rejection analysis" />; }
export function SalesReportsPage() { return <ReportStub title="Sales Reports" description="Revenue, order intake, and delivery metrics" />; }
export function InventoryReportsPage() { return <ReportStub title="Inventory Reports" description="Stock valuation and aging analysis" />; }
export function QualityReportsPage() { return <ReportStub title="Quality Reports" description="PPM, rejection trends, and supplier quality" />; }
export function MachineUtilizationReportsPage() { return <ReportStub title="Machine Utilization Reports" description="OEE, downtime analysis, and capacity utilization" />; }
export function CostAnalysisReportsPage() { return <ReportStub title="Cost Analysis Reports" description="Variance analysis and profitability metrics" />; }
