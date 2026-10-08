import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { collectDrawings, collectProducts, type DrawingFile, type ProductRef } from '@/lib/pipelineDrawings';

/** The real files and products of the pipeline: attachments on enquiries, sales orders and inwards, plus what was uploaded on the Parts & Drawings / Documents pages. */
export function usePipelineFiles(companyKey?: string) {
  const [files, setFiles] = useState<DrawingFile[] | null>(null);
  const [refs, setRefs] = useState<ProductRef[]>([]);
  const [error, setError] = useState('');
  const [tableMissing, setTableMissing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [enq, so, inw, up] = await Promise.all([
        supabase.from('cnc_enquiries').select('*'),
        supabase.from('cnc_sales_orders').select('*'),
        supabase.from('cnc_inwards').select('*'),
        supabase.from('cnc_drawing_versions').select('*'),
      ]);
      const bad = [enq, so, inw].find(r => r.error);
      if (bad?.error) throw new Error(bad.error.message);
      setTableMissing(!!up.error);
      const inwards = ((inw.data ?? []) as Record<string, unknown>[]).filter(r => String(r.status ?? '') !== 'Deleted');
      setRefs(collectProducts((so.data ?? []) as never[], inwards));
      setFiles(collectDrawings((enq.data ?? []) as never[], (so.data ?? []) as never[], inwards, up.error ? [] : ((up.data ?? []) as never[])));
    } catch (e) { setFiles([]); setError(e instanceof Error ? e.message : 'Could not load the files.'); }
  }, []);
  useEffect(() => { void load(); }, [load, companyKey]);

  return { files, refs, error, tableMissing, reload: load };
}
