import { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Printer, Search, TrendingUp } from 'lucide-react';
import { Badge, Button, Card, statusToVariant } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDate, formatINR, todayISO } from '@/lib/format';
import { exportCsv, escapeHtml, printHtml } from '@/lib/reportExport';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

type ProjectRow={project_name:string;party_name:string;part_name:string;quantity:string|null;planned_cost:string|null;actual_cost:string|null;sales_value:string|null;cost_source:string|null;profit?:string|null;profit_pct?:string|null};
type CostingDetail={project:ProjectRow&{product_cost:string|null;process_cost:string|null;invoice_value:string|null};categories:{category:string;amount:string}[];processes:{id:string;process:string;supplier:string;duration:string;quantity:string;rate:string;amount:string;created_at:string}[];materials:{id:string;date:string;type:string;reference:string;item:string;quantity:string;unit:string;rate:string;amount:string;work_order:string;request_no:string}[];work_orders:{id:string;wo_no:string;sales_order:string;customer:string;part_name:string;part_no:string;quantity:string;completed:string;rejected:string;status:string;due_date:string}[];operations?:{id:string;job_no:string;operation:string;machine:string;operator:string;qty_planned:string;qty_completed:string;qty_rejected:string;cycle_time:string;setup_time:string;status:string}[]};
const money=(v:string|null|undefined)=>v==null||v===''?'—':formatINR(v,{decimals:'auto'});
const tabs=['Cost Summary','Process Costing','Material Cost','Machine & Labour','Outside Process','Tooling & Consumables','Overhead','Comparison'];

export function ProjectCostingPage(){
  const {company}=useAuth();
  const [search,setSearch]=useState('');
  const [appliedSearch,setAppliedSearch]=useState('');
  const [projects,setProjects]=useState<ProjectRow[]>([]);
  const [total,setTotal]=useState(0);
  const [page,setPage]=useState(1);
  const [selected,setSelected]=useState<ProjectRow|null>(null);
  const [report,setReport]=useState<CostingDetail|null>(null);
  const [tab,setTab]=useState('Cost Summary');
  const [loading,setLoading]=useState(true);
  const [detailLoading,setDetailLoading]=useState(false);
  const [error,setError]=useState('');
  const pageSize=10;

  const loadProjects=async(p=1,q=appliedSearch)=>{
    setLoading(true);setError('');
    try{
      const {data,error:rpcError}=await supabase.rpc('erp_costing_projects',{p_search:q||null,p_page:p,p_page_size:pageSize} as never);
      if(rpcError)throw new Error(rpcError.message);
      const result=data as any;setProjects(result.rows||[]);setTotal(result.total||0);setPage(p);
      const next=(result.rows||[]).find((x:ProjectRow)=>selected&&x.project_name===selected.project_name&&x.part_name===selected.part_name&&x.party_name===selected.party_name)||result.rows?.[0]||null;
      setSelected(next);
    }catch(e){setProjects([]);setTotal(0);setError(e instanceof Error?e.message:'Unable to load project costing.');}
    finally{setLoading(false);}
  };

  const loadDetail=async(p:ProjectRow|null)=>{
    if(!p){setReport(null);return}
    setDetailLoading(true);setError('');
    try{
      const {data,error:rpcError}=await supabase.rpc('erp_project_costing_detail',{p_project_name:p.project_name,p_part_name:p.part_name||null,p_party_name:p.party_name||null} as never);
      if(rpcError)throw new Error(rpcError.message);
      setReport(data as CostingDetail);
    }catch(e){setReport(null);setError(e instanceof Error?e.message:'Unable to load costing details.');}
    finally{setDetailLoading(false);}
  };

  useEffect(()=>{void loadProjects(1,'')},[company?.id]);
  useEffect(()=>{void loadDetail(selected)},[selected?.project_name,selected?.part_name,selected?.party_name,company?.id]);

  const project=report?.project;
  const categoryRows=report?.categories||[];
  const jobs=report?.work_orders||[];
  const completed=jobs.reduce((n,w)=>n+Number(w.completed||0),0);
  const rejected=jobs.reduce((n,w)=>n+Number(w.rejected||0),0);
  const quantity=jobs.reduce((n,w)=>n+Number(w.quantity||0),0);
  const progress=quantity?Math.min(100,completed/quantity*100):0;
  const totalActual=project?.product_cost??project?.process_cost??null;
  const profit=project?.profit??null;
  const profitPct=project?.profit_pct??null;
  const maxCategory=Math.max(1,...categoryRows.map(x=>Number(x.amount)));
  const categoryForTab=useMemo(()=>{
    if(tab==='Tooling & Consumables')return categoryRows.filter(x=>/tool|consum|fixture/i.test(x.category));
    if(tab==='Overhead')return categoryRows.filter(x=>/overhead|admin|factory/i.test(x.category));
    return categoryRows;
  },[categoryRows,tab]);

  const exportReport=()=>{
    if(!report)return;
    exportCsv('Costing_'+report.project.project_name,[['Project',report.project.project_name],['Customer',report.project.party_name],['Part',report.project.part_name],['Planned Cost',report.project.planned_cost||''],['Recorded Actual Cost',totalActual||''],['Sales Order Value',report.project.sales_value||''],['Recorded Margin',profit||''],[],['Cost Category','Actual Amount'],...categoryRows.map(x=>[x.category,x.amount]),[],['Process','Supplier','Quantity','Duration','Rate','Amount'],...(report.processes||[]).map(x=>[x.process,x.supplier,x.quantity,x.duration,x.rate,x.amount]),[],['Date','Source','Item','Quantity','Unit','Rate','Amount'],...(report.materials||[]).map(x=>[x.date,x.request_no,x.item,x.quantity,x.unit,x.rate,x.amount])]);
  };
  const printReport=()=>{
    if(!report){window.print();return}
    const rows=categoryRows.map(x=>'<tr><td>'+escapeHtml(x.category)+'</td><td>'+money(x.amount)+'</td></tr>').join('');
    printHtml('Project Costing '+report.project.project_name,'<h1>ARGUS CNC</h1><h2>Project Costing</h2><p>'+escapeHtml(report.project.project_name)+' · '+escapeHtml(report.project.part_name)+' · '+escapeHtml(report.project.party_name)+'</p><table><thead><tr><th>Cost Head</th><th>Recorded Actual</th></tr></thead><tbody>'+rows+'</tbody></table><p>Planned: '+money(report.project.planned_cost)+' · Actual: '+money(totalActual)+' · Sales Order: '+money(report.project.sales_value)+'</p>');
  };

  return <div className="p-4 lg:p-6 space-y-4 bg-slate-50 min-h-full">
    <PageHeader title="Project Costing" description="Cost analysis from existing project costs, production records and inventory movements." actions={<><Button variant="secondary" size="sm" icon={<Download size={14}/>} onClick={exportReport} disabled={!report}>Export</Button><Button variant="secondary" size="sm" icon={<Printer size={14}/>} onClick={printReport}>Print</Button></>}/>
    {error&&<div className="border border-rose-200 bg-rose-50 text-rose-700 rounded p-2 text-sm">{error}</div>}
    <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-4 items-start">
      <Card className="overflow-hidden"><div className="p-3 border-b bg-slate-50"><h3 className="font-bold text-sm">Projects / Work Orders</h3><form className="mt-2 flex gap-1" onSubmit={e=>{e.preventDefault();setAppliedSearch(search);void loadProjects(1,search)}}><input className={inputClass} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search project, part, customer..."/><Button size="sm" type="submit" aria-label="Search"><Search size={14}/></Button></form></div>
        <div className="max-h-[340px] overflow-auto divide-y">{loading?<div className="p-6 text-center text-xs text-slate-500">Loading projects...</div>:projects.map(p=><button key={p.project_name+'|'+p.part_name+'|'+p.party_name} onClick={()=>setSelected(p)} className={'w-full text-left p-3 hover:bg-blue-50 '+(selected?.project_name===p.project_name&&selected?.part_name===p.part_name?'bg-blue-50':'')}><div className="font-semibold text-xs text-slate-800">{p.project_name}</div><div className="text-[10px] text-slate-500">{p.part_name} · {p.party_name}</div><div className="text-[10px] mt-1 text-slate-600">Recorded actual: {money(p.actual_cost)}</div></button>)}{!loading&&!projects.length&&<div className="p-6 text-center text-xs text-slate-500">No project cost records found.</div>}</div>
        <div className="flex justify-between p-2 border-t text-xs text-slate-500"><span>{total} projects</span><div className="flex gap-2"><button disabled={page<=1} onClick={()=>void loadProjects(page-1)}><span className="sr-only">Previous</span>‹</button>{page}<button disabled={page*pageSize>=total} onClick={()=>void loadProjects(page+1)}><span className="sr-only">Next</span>›</button></div></div>
      </Card>
      <div className="space-y-4">
        {!selected?<Card className="p-12 text-center text-sm text-slate-500">Select a project or work order to view its costing.</Card>:<>
          <Card className="p-4"><div className="flex flex-wrap justify-between gap-4"><div><div className="text-[10px] uppercase tracking-wide text-slate-500">Project / Work Order</div><h2 className="text-lg font-bold">{selected.project_name}</h2><div className="text-sm text-slate-600">{selected.part_name} · {selected.party_name}</div>{jobs.length>0&&<div className="mt-2 flex flex-wrap gap-2">{jobs.map(w=><Badge key={w.id} variant={statusToVariant(w.status)}>{w.wo_no} · {w.status}</Badge>)}</div>}</div><div className="text-right"><div className="text-xs text-slate-500">Sales Order Value</div><div className="font-bold">{money(project?.sales_value)}</div></div></div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4"><Metric title="Planned Cost" value={money(project?.planned_cost)} note={project?.planned_cost?'From planned_workings':'No estimate source recorded'}/><Metric title="Recorded Actual Cost" value={money(totalActual)} note={project?.cost_source||'No cost source recorded'}/><Metric title="Sales Value" value={money(project?.sales_value)} note="Linked sales order only"/><Metric title="Margin on Recorded Cost" value={money(profit)} note={profitPct?profitPct+'%':'Not available'}/></div>
            <div className="mt-4 border rounded-lg p-3 bg-slate-50"><div className="flex justify-between text-xs"><b>Production Progress</b><span>{quantity?completed+' completed · '+Math.max(0,quantity-completed-rejected)+' pending · '+rejected+' rejected':'No linked work order quantities'}</span></div><div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{width:progress+'%'}}/></div><div className="text-right text-xs mt-1 font-semibold">{progress.toFixed(1)}%</div></div>
          </Card>
          <div className="flex overflow-auto border-b">{tabs.map(x=><button key={x} onClick={()=>setTab(x)} className={'whitespace-nowrap px-3 py-2 text-[11px] font-semibold border-b-2 '+(tab===x?'border-brand-600 text-brand-700':'border-transparent text-slate-500')}>{x}</button>)}</div>
          {detailLoading?<Card className="p-12 text-center text-sm text-slate-500">Loading costing records...</Card>:<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {(tab==='Cost Summary'||tab==='Comparison')&&<Card className="overflow-hidden"><div className="p-3 border-b bg-slate-50"><h3 className="font-bold text-sm">{tab==='Comparison'?'Planned vs Actual':'Cost Breakdown'}</h3></div><table className="w-full text-xs"><thead><tr className="bg-slate-50 text-slate-500"><th className="p-2 text-left">Cost Head</th><th className="p-2 text-right">Planned</th><th className="p-2 text-right">Recorded Actual</th><th className="p-2 text-right">Variance</th></tr></thead><tbody>{categoryForTab.map(x=><tr key={x.category} className="border-t"><td className="p-2">{x.category}</td><td className="p-2 text-right">—</td><td className="p-2 text-right">{money(x.amount)}</td><td className="p-2 text-right">—</td></tr>)}{!categoryForTab.length&&<tr><td colSpan={4} className="p-6 text-center text-slate-500">{project?.planned_cost?'Planned amount is available at project level; category estimates are not configured.':'No categorized cost records for this project.'}</td></tr>}</tbody><tfoot><tr className="border-t bg-slate-50 font-bold"><td className="p-2">Recorded Total</td><td className="p-2 text-right">{money(project?.planned_cost)}</td><td className="p-2 text-right">{money(totalActual)}</td><td className="p-2 text-right">—</td></tr></tfoot></table></Card>}
            {(tab==='Cost Summary'||tab==='Comparison')&&<Card className="p-4"><h3 className="font-bold text-sm mb-3">Recorded Cost Distribution</h3>{categoryRows.length?categoryRows.map((x,i)=><div key={x.category} className="mb-3"><div className="flex justify-between text-xs"><span>{x.category}</span><b>{money(x.amount)}</b></div><div className="h-2 rounded bg-slate-100 mt-1"><div className={'h-full rounded '+['bg-blue-500','bg-amber-500','bg-emerald-500','bg-rose-500','bg-violet-500','bg-cyan-500'][i%6]} style={{width:Math.max(1,Number(x.amount)/maxCategory*100)+'%'}}/></div></div>):<div className="text-xs text-slate-500">No cost distribution is available.</div>}<div className="border-t pt-3 mt-3 text-xs text-slate-500">Distribution reflects saved product_costing categories. Process details and inventory issues are traceable below and are not added twice.</div></Card>}
            {(tab==='Process Costing'||tab==='Outside Process')&&<Card className="overflow-hidden xl:col-span-2"><div className="p-3 border-b bg-slate-50"><h3 className="font-bold text-sm">{tab==='Outside Process'?'Outside Process Cost':'Process Wise Costing'}</h3></div><div className="overflow-auto"><table className="w-full min-w-[700px] text-xs"><thead><tr className="bg-slate-50 text-slate-500"><th className="p-2 text-left">Process</th><th className="p-2 text-left">Supplier / Party</th><th className="p-2 text-right">Quantity</th><th className="p-2 text-right">Duration</th><th className="p-2 text-right">Rate</th><th className="p-2 text-right">Recorded Cost</th><th className="p-2">Date</th></tr></thead><tbody>{(report?.processes||[]).map(x=><tr key={x.id} className="border-t"><td className="p-2">{x.process}</td><td className="p-2">{x.supplier||'—'}</td><td className="p-2 text-right">{x.quantity||'—'}</td><td className="p-2 text-right">{x.duration||'—'}</td><td className="p-2 text-right">{money(x.rate)}</td><td className="p-2 text-right">{money(x.amount)}</td><td className="p-2">{formatDate(x.created_at)}</td></tr>)}{!report?.processes?.length&&<tr><td colSpan={7} className="p-8 text-center text-slate-500">No process cost records for this project.</td></tr>}</tbody></table></div></Card>}
            {tab==='Material Cost'&&<Card className="overflow-hidden xl:col-span-2"><div className="p-3 border-b bg-slate-50"><h3 className="font-bold text-sm">Material Cost from Inventory Issues</h3><p className="text-[10px] text-slate-500">Source: posted stock movements linked through material request and work order.</p></div><div className="overflow-auto"><table className="w-full min-w-[700px] text-xs"><thead><tr className="bg-slate-50 text-slate-500"><th className="p-2">Date</th><th className="p-2 text-left">Item</th><th className="p-2">Request</th><th className="p-2 text-right">Quantity</th><th className="p-2">Unit</th><th className="p-2 text-right">Rate</th><th className="p-2 text-right">Amount</th></tr></thead><tbody>{(report?.materials||[]).map(x=><tr key={x.id} className="border-t"><td className="p-2">{formatDate(x.date)}</td><td className="p-2">{x.item}</td><td className="p-2">{x.request_no}</td><td className="p-2 text-right">{x.quantity}</td><td className="p-2">{x.unit}</td><td className="p-2 text-right">{money(x.rate)}</td><td className="p-2 text-right">{money(x.amount)}</td></tr>)}{!report?.materials?.length&&<tr><td colSpan={7} className="p-8 text-center text-slate-500">No linked material issue records.</td></tr>}</tbody></table></div></Card>}
            {tab==='Machine & Labour'&&<Card className="overflow-hidden xl:col-span-2"><div className="p-3 border-b bg-slate-50"><h3 className="font-bold text-sm">Production Operations</h3><p className="text-[10px] text-slate-500">Machine and operator hours/rates are not stored in the current job card schema, so monetary costs are not estimated here.</p></div><div className="overflow-auto"><table className="w-full min-w-[650px] text-xs"><thead><tr className="bg-slate-50 text-slate-500"><th className="p-2">Job</th><th className="p-2 text-left">Operation</th><th className="p-2">Machine / Operator</th><th className="p-2">Planned Qty</th><th className="p-2">Completed</th><th className="p-2">Cycle / Setup record</th><th className="p-2">Status</th></tr></thead><tbody>{(report?.operations||[]).map(x=><tr key={x.id} className="border-t"><td className="p-2">{x.job_no}</td><td className="p-2">{x.operation}</td><td className="p-2">{x.machine} / {x.operator||'—'}</td><td className="p-2 text-right">{x.qty_planned||'—'}</td><td className="p-2 text-right">{x.qty_completed||'—'}</td><td className="p-2 text-right">{x.cycle_time||'—'} / {x.setup_time||'—'}</td><td className="p-2">{x.status||'—'}</td></tr>)}{!report?.operations?.length&&<tr><td colSpan={7} className="p-8 text-center text-slate-500">No linked job card records.</td></tr>}</tbody></table></div></Card>}
            {(tab==='Tooling & Consumables'||tab==='Overhead')&&<Card className="overflow-hidden xl:col-span-2"><div className="p-3 border-b bg-slate-50"><h3 className="font-bold text-sm">{tab}</h3></div><table className="w-full text-xs"><thead><tr className="bg-slate-50"><th className="p-2 text-left">Cost Head</th><th className="p-2 text-right">Recorded Actual</th></tr></thead><tbody>{categoryForTab.map(x=><tr key={x.category} className="border-t"><td className="p-2">{x.category}</td><td className="p-2 text-right">{money(x.amount)}</td></tr>)}{!categoryForTab.length&&<tr><td colSpan={2} className="p-8 text-center text-slate-500">No {tab.toLowerCase()} cost records are configured for this project.</td></tr>}</tbody></table></Card>}
          </div>}
        </>}
      </div>
    </div>
  </div>;
}

function Metric({title,value,note}:{title:string;value:string;note:string}){return <Card className="p-3"><div className="text-[10px] text-slate-500">{title}</div><div className="text-sm font-bold truncate">{value}</div><div className="mt-1 text-[10px] text-slate-400 truncate">{note}</div></Card>}
