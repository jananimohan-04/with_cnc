const fs = require('fs');
const path = require('path');

const fp = path.resolve('src/pages/sales/SalesPipelinePage.tsx');
let code = fs.readFileSync(fp, 'utf8');

const imports = [
  "import { SalesOrderModule } from './SalesOrderModule';",
  "import { InwardModule } from './InwardModule';",
  "import { FinishedGoodsModule } from './FinishedGoodsModule';",
  "import { DeliveryChallanModule } from './DeliveryChallanModule';",
  "import { InvoiceModule } from './InvoiceModule';"
].join('\n');

if (!code.includes('import { SalesOrderModule }')) {
  code = code.replace(
    `import { QuotationModule } from './QuotationModule';`,
    `import { QuotationModule } from './QuotationModule';\n${imports}`
  );
}

// Update state
const stateSearch = `const [activeView, setActiveView] = useState<'pipeline' | 'enquiry_list' | 'quotation_list'>('pipeline');`;
const stateReplace = `const [activeView, setActiveView] = useState<'pipeline' | 'enquiry_list' | 'quotation_list' | 'sales_order_list' | 'inward_list' | 'fg_list' | 'dc_list' | 'invoice_list'>('pipeline');`;
code = code.replace(stateSearch, stateReplace);

// Update click handlers
const statSearch = `             <div key={stat.title} onClick={() => { if(stat.stage === 'Enquiry') setActiveView('enquiry_list'); else if (stat.stage === 'Quotation') setActiveView('quotation_list'); }} className={\`bg-white rounded-xl p-4 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border \${(stat.stage === 'Enquiry' || stat.stage === 'Quotation') ? 'border-brand-300 cursor-pointer hover:border-brand-500' : 'border-slate-100'} flex items-center justify-between hover:-translate-y-1 transition-transform\`}>`;

const statReplace = `             <div key={stat.title} onClick={() => { 
               if (stat.stage === 'Enquiry') setActiveView('enquiry_list'); 
               else if (stat.stage === 'Quotation') setActiveView('quotation_list'); 
               else if (stat.stage === 'Sales Order') setActiveView('sales_order_list'); 
               else if (stat.stage === 'Inward') setActiveView('inward_list'); 
               else if (stat.stage === 'Finished Goods') setActiveView('fg_list'); 
               else if (stat.stage === 'DC') setActiveView('dc_list'); 
               else if (stat.stage === 'Invoice') setActiveView('invoice_list'); 
             }} className={\`bg-white rounded-xl p-4 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-brand-300 cursor-pointer hover:border-brand-500 flex items-center justify-between hover:-translate-y-1 transition-transform\`}>`;

code = code.replace(statSearch, statReplace);

// Update render block
const renderSearch = `      {/* 4. Kanban Pipeline (Horizontal Scroll) */}
      {activeView === 'enquiry_list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <EnquiryModule onBack={() => setActiveView('pipeline')} />
        </div>
      ) : activeView === 'quotation_list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <QuotationModule onBack={() => setActiveView('pipeline')} />
        </div>
      ) : (`;

const renderReplace = `      {/* 4. Kanban Pipeline (Horizontal Scroll) */}
      {activeView === 'enquiry_list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <EnquiryModule onBack={() => setActiveView('pipeline')} />
        </div>
      ) : activeView === 'quotation_list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <QuotationModule onBack={() => setActiveView('pipeline')} />
        </div>
      ) : activeView === 'sales_order_list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <SalesOrderModule onBack={() => setActiveView('pipeline')} />
        </div>
      ) : activeView === 'inward_list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <InwardModule onBack={() => setActiveView('pipeline')} />
        </div>
      ) : activeView === 'fg_list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <FinishedGoodsModule onBack={() => setActiveView('pipeline')} />
        </div>
      ) : activeView === 'dc_list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <DeliveryChallanModule onBack={() => setActiveView('pipeline')} />
        </div>
      ) : activeView === 'invoice_list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <InvoiceModule onBack={() => setActiveView('pipeline')} />
        </div>
      ) : (`;

code = code.replace(renderSearch, renderReplace);

fs.writeFileSync(fp, code);
console.log('Injected modules');
