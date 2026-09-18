import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://poioxmtrlqbiurrpgehd.supabase.co', 'sb_publishable_4eaPHUDkrAorDrlWn3G2Sw_2T79KVhD');
async function check() {
  const [woRes, machRes] = await Promise.all([
    supabase.from('cnc_work_orders').select('created_at, status'),
    supabase.from('cnc_machines').select('type, utilization')
  ]);

  let machineStats = [];
  if (machRes.data) {
    const grouped = machRes.data.reduce((acc, m) => {
      acc[m.type] = acc[m.type] || { sum: 0, count: 0 };
      acc[m.type].sum += m.utilization;
      acc[m.type].count += 1;
      return acc;
    }, {});
    machineStats = Object.keys(grouped).map(type => ({
      label: type,
      val: Math.round(grouped[type].sum / grouped[type].count)
    }));
  }
  console.log('Machines:', machineStats);

  let chart = [];
  if (woRes.data) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthCounts = woRes.data.reduce((acc, wo) => {
      if(!wo.created_at) return acc;
      const d = new Date(wo.created_at);
      const k = months[d.getMonth()];
      acc[k] = acc[k] || { name: k, planned: 0, completed: 0 };
      acc[k].planned++;
      if (wo.status === 'Completed') acc[k].completed++;
      return acc;
    }, {});
    // just return last 7 months somehow
    const currentMonth = new Date().getMonth();
    for (let i = 6; i >= 0; i--) {
        let mIndex = currentMonth - i;
        if (mIndex < 0) mIndex += 12;
        const k = months[mIndex];
        chart.push(monthCounts[k] || { name: k, planned: 0, completed: 0 });
    }
  }
  console.log('Chart:', chart);
}
check();