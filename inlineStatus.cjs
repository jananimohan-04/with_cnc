const fs = require('fs');

function updateTab(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Add supabase import if missing
  if (!content.includes("import { supabase } from '@/lib/supabase';")) {
    content = content.replace(
      "import { getMockImage } from '@/lib/mockStorage';",
      "import { getMockImage } from '@/lib/mockStorage';\nimport { supabase } from '@/lib/supabase';"
    );
  }
  // In OtherTabs.tsx, it might not have getMockImage imported in the same place. Let's do it safely.
  if (!content.includes("import { supabase } from '@/lib/supabase';")) {
    content = content.replace(
      "import { DataTable",
      "import { supabase } from '@/lib/supabase';\nimport { DataTable"
    );
  }

  // Add handleStatusChange inside the component function
  // We need to find the start of the component to insert it.
  const handleStatusChangeCode = `
  const handleStatusChange = async (order: any, newStatus: string) => {
    if (order.status === newStatus) return;
    try {
      const { error } = await supabase.from('cnc_work_orders').update({ status: newStatus }).eq('id', order.id);
      if (error) throw error;
      refresh();
    } catch (err: any) {
      alert("Failed to update status: " + err.message);
    }
  };
`;
  
  if (filePath.includes("ProductionOrdersTab.tsx")) {
    content = content.replace(
      "const [selectedWO, setSelectedWO] = useState<any | null>(null);",
      "const [selectedWO, setSelectedWO] = useState<any | null>(null);\n" + handleStatusChangeCode
    );
  } else if (filePath.includes("OtherTabs.tsx")) {
    // For WIPTab
    content = content.replace(
      "export function WIPTab({ workOrders, refresh }: { workOrders: any[], refresh: () => void }) {",
      "export function WIPTab({ workOrders, refresh }: { workOrders: any[], refresh: () => void }) {\n" + handleStatusChangeCode
    );
    // For CompletedTab
    content = content.replace(
      "export function CompletedTab({ workOrders, refresh }: { workOrders: any[], refresh: () => void }) {",
      "export function CompletedTab({ workOrders, refresh }: { workOrders: any[], refresh: () => void }) {\n" + handleStatusChangeCode
    );
  }

  // Replace the render function for status
  const oldRender = "{ key: 'status', label: 'Status', sortable: true, render: (r) => <Badge variant={statusToVariant(r.status)} dot>{r.status}</Badge> }";
  const oldRenderOther = "{ key: 'status', label: 'Status', render: (r) => <Badge variant={statusToVariant(r.status)}>{r.status}</Badge> }";

  const newRender = `{ key: 'status', label: 'Status', sortable: true, render: (r) => (
        <div className="relative inline-block w-full text-center">
          <select 
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            value={r.status}
            onChange={(e) => handleStatusChange(r, e.target.value)}
          >
            <option value="Planning">Planning</option>
            <option value="Planned">Planned</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="Dispatched">Dispatched</option>
          </select>
          <Badge variant={statusToVariant(r.status)} dot>{r.status}</Badge>
        </div>
      ) }`;

  content = content.replace(oldRender, newRender);
  // OtherTabs has a different render string
  content = content.replace(oldRenderOther, newRender.replace('sortable: true, ', '')); // WIPTab doesn't have sortable: true
  content = content.replace(oldRenderOther, newRender.replace('sortable: true, ', '')); // CompletedTab

  fs.writeFileSync(filePath, content);
}

updateTab('src/pages/production/unified/ProductionOrdersTab.tsx');
updateTab('src/pages/production/unified/OtherTabs.tsx');

