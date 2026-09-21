const fs = require('fs');
let content = fs.readFileSync('src/pages/production/unified/OtherTabs.tsx', 'utf8');

// JobCardTab doesn't have refresh, so let's just make it not use handleStatusChange.
// We will replace the status column in JobCardTab back to the normal one.
const badRenderJobCard = `{ key: 'status', label: 'Status', render: (r) => (
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

const goodRenderJobCard = `{ key: 'status', label: 'Status', render: (r) => <Badge variant={statusToVariant(r.status)}>{r.status}</Badge> }`;

// Replace first instance (JobCardTab) back to normal
content = content.replace(badRenderJobCard, goodRenderJobCard);

// Now for WIPTab and CompletedTab, the string was replaced successfully but they don't have handleStatusChange defined!
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

content = content.replace(
  "export function WIPTab({ workOrders, refresh }: { workOrders: any[], refresh: () => void }) {\n",
  "export function WIPTab({ workOrders, refresh }: { workOrders: any[], refresh: () => void }) {\n" + handleStatusChangeCode
);

content = content.replace(
  "export function CompletedTab({ workOrders, refresh }: { workOrders: any[], refresh: () => void }) {\n",
  "export function CompletedTab({ workOrders, refresh }: { workOrders: any[], refresh: () => void }) {\n" + handleStatusChangeCode
);

fs.writeFileSync('src/pages/production/unified/OtherTabs.tsx', content);
