import type { LucideIcon } from 'lucide-react';
import { Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';

// "Create Quotation" menu section. The menu entries and routes are in place; each screen below
// is an empty-state placeholder until its feature is built.
function QuotationToolStub({ title, description, icon: Icon }: { title: string; description: string; icon: LucideIcon }) {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title={title} description={description} />
      <div className="flex flex-col items-center justify-center h-64 border border-dashed border-slate-300 rounded-xl bg-slate-50">
        <Icon className="text-slate-400 mb-3" size={32} />
        <h3 className="text-slate-700 font-medium">{title}</h3>
        <p className="text-slate-500 text-sm mt-1">This module is currently under development.</p>
      </div>
    </div>
  );
}

// The calculator is a real, working page (see MetalCalculatorPage.tsx).
export { CompanyProfilePage } from './CompanyProfilePage';
export { MetalCalculatorPage } from './MetalCalculatorPage';
export { CreateQuotationPage } from './CreateQuotationPage';
export function ClientLibraryPage() {
  return <QuotationToolStub title="Client Library" description="Saved client details for quotations" icon={Users} />;
}
export { ProductLibraryPage } from './ProductLibraryPage';
export { TermsLibraryPage } from './TermsLibraryPage';
export { QuotationLibraryPage } from './QuotationLibraryPage';
