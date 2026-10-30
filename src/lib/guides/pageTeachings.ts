// Hand-written introductions for the main screens (English / Tamil). The Teaching tour speaks the first paragraph of the
// matching screen before it explains every option on it.

export const PAGE_TEACHINGS: Record<string, { en: string; ta: string }> = {
  '/sales/pipeline': {
    en: `Welcome to the Sales Pipeline! This is the heart of your sales process. 
    
    The Kanban Board shows all your orders moving from left to right through stages: Enquiry, Quotation, Sales Order, Inward, Finished Goods, Delivery Challan, and Invoice.
    
    At the top, you see quick stats showing counts for each stage. Click any stat to see the full list.
    
    The Add Company button lets you add new customers. Enter their name, address, GST number, and contact details.
    
    The Add Enquiry button creates a new customer request. Pick the company, add products they want, quantity, and any remarks.
    
    Each card on the board represents one order. You can drag cards between columns to change their status.
    
    Click any card to see full details and take actions like creating a quotation, sales order, or delivery challan.
    
    The Create Quotation button generates a price quote for the customer with products, quantities, prices, and terms.
    
    Use the Search bar to find specific enquiries, companies, or products.
    
    The Filter options let you see only certain stages or date ranges.
    
    Switch between Kanban Board, List View, and Calendar views using the tabs at the top.`,
    ta: `Sales Pipeline-க்கு வரவேற்கிறோம்! இது உங்கள் விற்பனை செயல்முறையின் இதயம்.
    
    Kanban Board அனைத்து ஆர்டர்களையும் இடமிருந்து வலமாக நிலைகளில் காட்டுகிறது: Enquiry, Quotation, Sales Order, Inward, Finished Goods, Delivery Challan, Invoice.
    
    மேலே ஒவ்வொரு நிலைக்கான எண்ணிக்கைகளைக் காட்டும் விரைவு புள்ளிவிவரங்கள் உள்ளன.
    
    Add Company பட்டன் புதிய வாடிக்கையாளர்களைச் சேர்க்க அனுமதிக்கிறது.
    
    Add Enquiry பட்டன் புதிய வாடிக்கையாளர் கோரிக்கையை உருவாக்குகிறது.
    
    ஒவ்வொரு அட்டையும் ஒரு ஆர்டரைக் குறிக்கிறது. நிலையை மாற்ற அட்டைகளை நெடுவரிசைகளுக்கு இடையே இழுக்கலாம்.`
  },
  '/production/scheduling': {
    en: `Welcome to Machine Scheduling! This page helps you plan production on your machines.
    
    The timeline shows all machines on the left and time slots across the top.
    
    Drag unscheduled jobs from the sidebar onto a machine's timeline to schedule them.
    
    Each colored block represents a scheduled job. The color indicates the priority or status.
    
    Double-click any scheduled block to edit its timing, machine, or other details.
    
    Use the date picker to navigate to different days or weeks.
    
    The filter buttons let you show only certain machines or job types.
    
    Right-click a scheduled job for quick actions like reschedule, cancel, or mark complete.
    
    The capacity indicator shows how loaded each machine is.
    
    Conflicts are highlighted in red - this means jobs overlap or exceed machine capacity.`,
    ta: `Machine Scheduling-க்கு வரவேற்கிறோம்! இந்தப் பக்கம் உங்கள் இயந்திரங்களில் உற்பத்தியைத் திட்டமிட உதவுகிறது.
    
    Timeline இடதுபுறத்தில் அனைத்து இயந்திரங்களையும், மேலே நேர slot-களையும் காட்டுகிறது.
    
    திட்டமிடாத வேலைகளை sidebar-லிருந்து இயந்திர timeline-க்கு இழுத்து திட்டமிடுங்கள்.
    
    ஒவ்வொரு வண்ண block-ம் திட்டமிடப்பட்ட வேலையைக் குறிக்கிறது.`
  },
  '/production/planning': {
    en: `Welcome to Production Planning! Here you manage all your production work orders.
    
    The table shows all work orders with their status, customer, product, quantity, and due date.
    
    Click New Work Order to create a new production order. Select the sales order, product, and quantity to produce.
    
    Each work order can have multiple job cards - one for each operation like cutting, machining, finishing.
    
    Click a work order row to see its job cards and track progress.
    
    Use the Status filter to see only pending, in-progress, or completed orders.
    
    The Actions column has buttons to create job cards, view details, or close the work order.
    
    Export the list to Excel using the Export button for reporting.`,
    ta: `Production Planning-க்கு வரவேற்கிறோம்! இங்கே நீங்கள் அனைத்து உற்பத்தி work orders-ஐயும் நிர்வகிக்கிறீர்கள்.`
  },
  '/finance/invoices': {
    en: `Welcome to Invoices! Here you create and manage all your sales invoices.
    
    The invoice list shows all invoices with number, date, customer, amount, and payment status.
    
    Click Create Invoice to make a new invoice. You can create from a delivery challan or directly.
    
    Each invoice shows line items with product, quantity, rate, tax, and total.
    
    The Record Receipt button lets you record payments against invoices.
    
    Use Print or Download to get a PDF of the invoice.
    
    The email button sends the invoice directly to the customer.
    
    Filter by date range, customer, or payment status to find specific invoices.
    
    Unpaid invoices are highlighted. You can see aging reports to track overdue payments.`,
    ta: `Invoices-க்கு வரவேற்கிறோம்! இங்கே நீங்கள் அனைத்து விற்பனை invoices-ஐயும் உருவாக்கி நிர்வகிக்கிறீர்கள்.`
  },
  '/finance/bank-entry': {
    en: `Welcome to Bank Entry! Here you record all bank transactions.
    
    Click Add Entry to record a deposit, withdrawal, or transfer.
    
    Select the bank account, enter the amount, date, and description.
    
    For customer receipts, link it to an invoice so it marks as paid.
    
    For supplier payments, link it to a purchase order.
    
    The Import Statement button lets you upload bank statements to reconcile transactions.
    
    View the running balance for each account.
    
    Transfer between accounts using the Transfer button.`,
    ta: `Bank Entry-க்கு வரவேற்கிறோம்! இங்கே நீங்கள் அனைத்து வங்கி பரிவர்த்தனைகளையும் பதிவு செய்கிறீர்கள்.`
  },
  '/accounts/ledger': {
    en: `Welcome to Ledger! This shows all account transactions.
    
    Select an account from the dropdown to see its transactions.
    
    Each row shows date, description, debit, credit, and running balance.
    
    Use the date filter to see transactions for a specific period.
    
    Export to PDF or Excel for reporting and auditing.
    
    Double-click any entry to see the full voucher details.
    
    The opening balance and closing balance are shown at top and bottom.`,
    ta: `Ledger-க்கு வரவேற்கிறோம்! இது அனைத்து கணக்கு பரிவர்த்தனைகளையும் காட்டுகிறது.`
  },
  '/accounts/trial-balance': {
    en: `Welcome to Trial Balance! This shows debit and credit totals for all accounts.
    
    All accounts are listed with their debit or credit balance.
    
    The totals at the bottom should match - this confirms your books are balanced.
    
    Use the date picker to see trial balance as of a specific date.
    
    Export to PDF or Excel for auditing purposes.
    
    Click any account to drill down into its ledger.`,
    ta: `Trial Balance-க்கு வரவேற்கிறோம்!`
  },
  '/inventory/stock': {
    en: `Welcome to Stock Overview! Here you see all your inventory.
    
    The table shows items with current quantity, location, and value.
    
    Use Add Stock to record incoming inventory.
    
    Use Stock Out to record items used or sold.
    
    The low stock alert shows items below minimum quantity.
    
    Click an item to see its movement history.
    
    Use filters to see only certain categories or locations.
    
    Export the full inventory list to Excel.`,
    ta: `Stock Overview-க்கு வரவேற்கிறோம்!`
  },
  '/purchasing/orders': {
    en: `Welcome to Purchase Orders! Here you manage orders to your suppliers.
    
    Click New Purchase Order to create an order.
    
    Select the supplier, add items with quantities and prices.
    
    Submit for approval or send directly to supplier.
    
    Track order status: Draft, Sent, Confirmed, Received.
    
    Record Goods Receipt when items arrive.
    
    View supplier-wise purchase history.`,
    ta: `Purchase Orders-க்கு வரவேற்கிறோம்!`
  },
  '/dashboard': {
    en: `Welcome to the Dashboard! This gives you a bird's eye view of your business.
    
    The KPI cards at the top show key metrics: sales this month, pending orders, revenue, and more.
    
    Click any KPI card to drill down into details.
    
    Charts show trends over time - sales, production, inventory levels.
    
    The recent activity section shows latest enquiries, orders, and deliveries.
    
    Use the date range picker to change the reporting period.
    
    Quick action buttons let you add enquiry, create invoice, or view reports.`,
    ta: `Dashboard-க்கு வரவேற்கிறோம்! இது உங்கள் வணிகத்தின் பறவைப் பார்வையை வழங்குகிறது.`
  },
  '/costing/job-costing': {
    en: `Welcome to Project Costing! Here you track costs for each project.
    
    See material cost, labor cost, machine cost, and overheads for each job.
    
    Compare estimated vs actual costs.
    
    Add cost entries for materials used, labor hours, and machine time.
    
    View profitability by project.
    
    Export cost reports for analysis.`,
    ta: `Project Costing-க்கு வரவேற்கிறோம்!`
  },
  '/engineering/cnc-vault': {
    en: `Welcome to Products and Drawings! Here you manage product specifications.
    
    Add new products with their specifications and drawings.
    
    Upload drawing files (PDF, DXF, DWG) for each product.
    
    Create Bill of Materials (BOM) linking components to products.
    
    Define routing - the sequence of operations to make the product.
    
    Track drawing revisions and version history.
    
    Search products by name, code, or customer.`,
    ta: `Products and Drawings-க்கு வரவேற்கிறோம்!`
  },
  '/admin/users': {
    en: `Welcome to User Management! Here you manage who can access the system.
    
    Add new users with their email and password.
    
    Assign roles: Admin, Manager, Operator, Viewer.
    
    Set permissions for what each user can see and do.
    
    Deactivate users who should no longer have access.
    
    View login history and audit trail.`,
    ta: `User Management-க்கு வரவேற்கிறோம்!`
  },
  '/support/center': {
    en: `Welcome to Support Center! Here you get help with the system.
    
    Browse frequently asked questions.
    
    Watch video tutorials for each module.
    
    Submit a support ticket for issues.
    
    Chat with support team.
    
    View system status and announcements.`,
    ta: `Support Center-க்கு வரவேற்கிறோம்!`
  },
  '/production/tracking': {
    en: `Welcome to Production Tracking! Here you monitor real-time machine activity.
    
    See which machines are running, idle, or under maintenance.
    
    View current job on each machine with progress percentage.
    
    Log production output - pieces completed, rejected, reworked.
    
    Record machine downtime with reasons.
    
    Track operator performance and efficiency.
    
    View shift-wise production summary.`,
    ta: `Production Tracking-க்கு வரவேற்கிறோம்!`
  },
  '/production/process-master': {
    en: `Welcome to Process Master! Here you define your manufacturing processes.
    
    Add new processes like Cutting, Turning, Milling, Grinding, Heat Treatment.
    
    Set standard cycle time for each process.
    
    Define setup time and teardown time.
    
    Link processes to machines that can perform them.
    
    Set cost rates per hour for each process.
    
    Create process sequences (routings) for products.`,
    ta: `Process Master-க்கு வரவேற்கிறோம்!`
  },
  '/accounts/profit-loss': {
    en: `Welcome to Profit and Loss! This shows your income and expenses.
    
    Revenue section shows all sales income.
    
    Cost of Goods Sold shows direct production costs.
    
    Gross Profit is Revenue minus COGS.
    
    Operating Expenses show overhead costs.
    
    Net Profit is your bottom line after all expenses.
    
    Compare with previous periods.
    
    Export for financial reporting.`,
    ta: `Profit & Loss-க்கு வரவேற்கிறோம்!`
  },
  '/accounts/balance-sheet': {
    en: `Welcome to Balance Sheet! This shows your financial position.
    
    Assets section shows what you own - cash, inventory, equipment.
    
    Liabilities show what you owe - loans, payables.
    
    Equity shows owner's investment and retained earnings.
    
    Assets must equal Liabilities plus Equity.
    
    View current vs previous period comparison.
    
    Export for auditing and reporting.`,
    ta: `Balance Sheet-க்கு வரவேற்கிறோம்!`
  },
  '/accounts/opening-balances': {
    en: `Welcome to Opening Balances! Here you set starting balances for accounts.
    
    Enter balances as of your accounting start date.
    
    Set customer opening receivables.
    
    Set supplier opening payables.
    
    Enter bank account opening balances.
    
    Set inventory opening values.
    
    This ensures your reports are accurate from day one.`,
    ta: `Opening Balances-க்கு வரவேற்கிறோம்!`
  },
  '/finance/petty-cash': {
    en: `Welcome to Petty Cash! Here you manage small daily expenses.
    
    Record petty cash withdrawals and expenses.
    
    Categorize expenses - tea, travel, stationery, etc.
    
    Maintain petty cash float balance.
    
    Request petty cash replenishment.
    
    View expense reports by category and date.
    
    Approve or reject expense requests.`,
    ta: `Petty Cash-க்கு வரவேற்கிறோம்!`
  },
  '/admin/access': {
    en: `Welcome to Access Management! Here you control what users can access.
    
    Create permission profiles for different roles.
    
    Assign modules each role can access.
    
    Set read, write, delete permissions separately.
    
    Enable or disable specific features per role.
    
    Apply permissions to users or groups.
    
    Audit who has access to sensitive data.`,
    ta: `Access Management-க்கு வரவேற்கிறோம்!`
  },
  '/reports/production': {
    en: `Welcome to Production Reports! Here you analyze production data.
    
    View production output by machine, product, or period.
    
    See rejection and rework rates.
    
    Analyze machine utilization percentage.
    
    Compare planned vs actual production.
    
    Track OEE - Overall Equipment Effectiveness.
    
    Export reports to Excel or PDF.
    
    Schedule automated report emails.`,
    ta: `Production Reports-க்கு வரவேற்கிறோம்!`
  },
};
