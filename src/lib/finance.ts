import { supabase } from '@/lib/supabase';
export interface InvoiceRow { id:string; invoice_no:string; invoice_type:string; invoice_date:string|null; due_date:string|null; customer_name:string|null; customer_id:string|null; po_no:string|null; dc_no:string|null; part_name:string|null; quantity:string|number|null; basic_value:string; cgst:string; sgst:string; igst:string; total:string; received:string; balance:string; status:string; cancelled:boolean }
export interface InvoicePageResult { total:number; page:number; page_size:number; rows:InvoiceRow[] }
export interface InvoiceSummary { total_invoices:number; total_value:string; total_received:string; outstanding:string; overdue_count:number; overdue_amount:string; by_status:Record<string,number>; ageing:{current:string;d31_60:string;d61_90:string;d90_plus:string}; top_customers:{customer:string;value:string}[]; monthly:{day:string;invoiced:string;received:string}[] }
export interface InvoiceDetail extends InvoiceRow { taxable_value:string; round_off:string; billing_address?:string; customer_gstin?:string; payment_terms?:string; notes?:string; items:{id:string;description:string;hsn?:string;quantity:string;unit?:string;rate:string;gst_rate:string;amount:string}[]; receipts:{id:string;txn_no:string;txn_date:string;amount:string;mode?:string;reference_no?:string;status:string}[] }
export interface BankAccount { id:string; code:string; name:string; type:'Bank'|'Cash'; balance:string }
export interface BankFilters { accounts:BankAccount[]; expense_accounts:{id:string;code:string;name:string}[]; income_accounts:{id:string;code:string;name:string}[]; customers:{id:string;name:string}[]; suppliers:{id:string;name:string}[]; can_manage:boolean }
export interface BankRow { id:string; txn_no:string; txn_date:string; kind:string; direction:'IN'|'OUT'; account_id:string; account_name:string; party_type?:string; party_name?:string; customer_id?:string; supplier_id?:string; invoice_id?:string; receipt?:string|null; payment?:string|null; amount:string; mode?:string; reference_no?:string; description?:string; status:string; transfer_group?:string|null; balance?:string|null }
export interface BankPageResult { total:number; page:number; page_size:number; rows:BankRow[] }
export interface BankSummary { accounts:BankAccount[]; total_bank:string; total_cash:string; total_receipts:string; total_payments:string; pending_clearing:string; pending_count:number; receipts_vs_payments:{week:string;receipts:string;payments:string}[]; expense_by_category:{name:string;value:string}[] }
async function call<T>(name:string,args?:Record<string,unknown>):Promise<T>{const {data,error}=await supabase.rpc(name,args as never);if(error)throw new Error(error.message);return data as T}
export const financeApi={
 invoices:(a:{type?:string|null;status?:string|null;customer?:string|null;search?:string;from?:string;to?:string;page?:number;pageSize?:number})=>call<InvoicePageResult>('erp_invoices',{p_type:a.type??null,p_status:a.status??null,p_customer:a.customer??null,p_search:a.search??null,p_from:a.from??null,p_to:a.to??null,p_page:a.page??1,p_page_size:a.pageSize??10}),
 invoiceSummary:(from?:string,to?:string)=>call<InvoiceSummary>('erp_invoices_summary',{p_from:from??null,p_to:to??null}),
 invoice:(id:string)=>call<InvoiceDetail>('erp_invoice',{p_id:id}),
 saveInvoice:(invoice:Record<string,unknown>,items:Record<string,unknown>[])=>call<{id:string;invoice_no:string}>('erp_save_invoice',{p_invoice:invoice,p_items:items}),
 cancelInvoice:(id:string,reason:string)=>call<void>('erp_cancel_invoice',{p_id:id,p_reason:reason}),
 creditNote:(id:string,reason:string)=>call<{id:string;invoice_no:string}>('erp_credit_note',{p_invoice_id:id,p_reason:reason}),
 bankFilters:()=>call<BankFilters>('erp_bank_filters'),
 bankTransactions:(a:{kind?:string|null;account?:string|null;type?:string|null;party?:string|null;search?:string;from?:string;to?:string;page?:number;pageSize?:number})=>call<BankPageResult>('erp_bank_transactions',{p_kind:a.kind??null,p_account_id:a.account??null,p_type:a.type??null,p_party:a.party??null,p_search:a.search??null,p_from:a.from??null,p_to:a.to??null,p_page:a.page??1,p_page_size:a.pageSize??10}),
 bankSummary:(from?:string,to?:string)=>call<BankSummary>('erp_bank_summary',{p_from:from??null,p_to:to??null}),
 addBankEntry:(entry:Record<string,unknown>)=>call<{id:string;txn_no:string}>('erp_add_bank_entry',{p_entry:entry}),
 bankTransfer:(a:{from:string;to:string;amount:string;date:string;mode:string;reference:string;description:string})=>call<{txn_no:string;transfer_group:string}>('erp_bank_transfer',{p_from_account:a.from,p_to_account:a.to,p_amount:a.amount,p_date:a.date,p_mode:a.mode,p_reference:a.reference,p_description:a.description}),
 bankSetStatus:(id:string,status:string)=>call<void>('erp_bank_set_status',{p_id:id,p_status:status})
};
