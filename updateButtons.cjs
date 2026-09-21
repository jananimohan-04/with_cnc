const fs = require('fs');
let content = fs.readFileSync('src/pages/production/unified/ProductionOrderDetails.tsx', 'utf8');

// 1. Update handleStart and add handleComplete
const handleMethodsOld = `  const handleStart = async () => {
    await supabase.from('cnc_work_orders').update({ status: 'In Progress' }).eq('id', order.id);
    refresh();
  };`;

const handleMethodsNew = `  const handleStart = async () => {
    const { error } = await supabase.from('cnc_work_orders').update({ status: 'In Progress' }).eq('id', order.id);
    if (error) {
      alert("Failed to start production: " + error.message);
    } else {
      alert("Status updated to 'In Progress' successfully!");
      refresh();
    }
  };

  const handleComplete = async () => {
    const { error } = await supabase.from('cnc_work_orders').update({ status: 'Completed', completed: order.quantity }).eq('id', order.id);
    if (error) {
      alert("Failed to complete production: " + error.message);
    } else {
      alert("Production marked as Completed!");
      refresh();
    }
  };`;

content = content.replace(handleMethodsOld, handleMethodsNew);

// 2. Import Check icon if missing, actually we can just use CheckCircle from lucide-react if we can import it.
// Let's add CheckCircle to imports.
content = content.replace(
  "import { X, Play, Edit, Printer, FileText } from 'lucide-react';",
  "import { X, Play, Edit, Printer, FileText, CheckCircle } from 'lucide-react';"
);

// 3. Update the button rendering logic
const oldButtons = `{order.status !== 'Completed' && (
                <Button variant="primary" className="w-full gap-2 justify-center" onClick={handleStart}>
                  <Play size={16} /> Start Production
                </Button>
              )}`;

const newButtons = `{order.status === 'Planned' && (
                <Button variant="primary" className="w-full gap-2 justify-center" onClick={handleStart}>
                  <Play size={16} /> Start Production
                </Button>
              )}
              {order.status === 'In Progress' && (
                <Button variant="success" className="w-full gap-2 justify-center bg-green-600 text-white hover:bg-green-700" onClick={handleComplete}>
                  <CheckCircle size={16} /> Complete Production
                </Button>
              )}`;

content = content.replace(oldButtons, newButtons);

fs.writeFileSync('src/pages/production/unified/ProductionOrderDetails.tsx', content);
