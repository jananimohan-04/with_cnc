import { HSN_MASTER, HSN_LIST_ID } from '@/lib/hsnMaster';

/** Render once next to any input that uses list={HSN_LIST_ID}: suggests "9988 - JOB WORK" etc. */
export function HsnDatalist() {
  return <datalist id={HSN_LIST_ID}>{HSN_MASTER.map(h => <option key={h.code} value={h.code} label={`${h.code} - ${h.name}`}>{`${h.code} - ${h.name}`}</option>)}</datalist>;
}
