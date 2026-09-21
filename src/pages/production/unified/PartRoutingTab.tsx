import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { DataTable, type Column } from '@/components/ui/DataTable';

export function PartRoutingTab() {
  const [routings, setRoutings] = useState<any[]>([]);

  useEffect(() => {
    async function fetchRoutings() {
      const { data } = await supabase.from('cnc_routing').select('*').order('parent_part_no').order('op_no');
      if (data) setRoutings(data);
    }
    fetchRoutings();
  }, []);

  const columns: Column<any>[] = [
    { key: 'parent_part_no', label: 'Part No', sortable: true },
    { key: 'op_no', label: 'Op No', sortable: true },
    { key: 'operation', label: 'Process', sortable: true },
    { key: 'machine', label: 'Machine', sortable: true },
    { key: 'setup_time', label: 'Setup (min)', align: 'right' },
    { key: 'cycle_time', label: 'Cycle (min)', align: 'right' },
    { key: 'description', label: 'Description' }
  ];

  return (
    <div className="p-4">
      <DataTable data={routings} columns={columns} searchKeys={['parent_part_no', 'operation', 'machine']} />
    </div>
  );
}
