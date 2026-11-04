import { supabase } from '@/lib/supabase';

const LOCAL_STORAGE_KEY = 'argus_user_jd_map';
const TABLE = 'cnc_user_job_descriptions';

function readLocalMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalMap(map: Record<string, string>) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* storage restricted */
  }
}

/**
 * Fetch the map of user ID / email to assigned Job Description ID.
 * Falls back transparently to localStorage if the table has not been migrated yet.
 */
export async function fetchUserJdMap(): Promise<Record<string, string>> {
  const localMap = readLocalMap();
  try {
    const { data, error } = await supabase
      .from(TABLE as never)
      .select('user_id, user_email, jd_id' as never);

    if (error) {
      // Table doesn't exist yet or query failed - return localStorage cache
      return localMap;
    }

    const merged = { ...localMap };
    if (Array.isArray(data)) {
      for (const row of data as any[]) {
        if (row.jd_id) {
          if (row.user_id) merged[row.user_id] = row.jd_id;
          if (row.user_email) merged[String(row.user_email).toLowerCase()] = row.jd_id;
        }
      }
    }
    writeLocalMap(merged);
    return merged;
  } catch {
    return localMap;
  }
}

/**
 * Assign or remove a Job Description for a user.
 */
export async function saveUserJd(
  userId: string | null | undefined,
  userEmail: string,
  jdId: string | null,
  companyId?: string | null,
): Promise<void> {
  const normEmail = (userEmail || '').trim().toLowerCase();
  const localMap = readLocalMap();

  if (jdId) {
    if (userId) localMap[userId] = jdId;
    if (normEmail) localMap[normEmail] = jdId;
  } else {
    if (userId) delete localMap[userId];
    if (normEmail) delete localMap[normEmail];
  }
  writeLocalMap(localMap);

  try {
    if (!jdId) {
      // Remove from table
      if (userId) {
        await supabase.from(TABLE as never).delete().eq('user_id' as never, userId as never);
      } else if (normEmail) {
        await supabase.from(TABLE as never).delete().eq('user_email' as never, normEmail as never);
      }
    } else {
      // Upsert into table
      const payload: Record<string, any> = {
        user_email: normEmail,
        jd_id: jdId,
        updated_at: new Date().toISOString(),
      };
      if (userId) payload.user_id = userId;
      if (companyId) payload.company_id = companyId;

      await supabase.from(TABLE as never).upsert([payload] as never, {
        onConflict: userId ? 'user_id' : 'user_email',
      } as never);
    }
  } catch {
    // If the database table does not exist yet, localStorage ensures seamless UI operation
  }
}

/**
 * Helper to get the assigned JD ID for a given user from the map.
 */
export function getUserJdId(
  map: Record<string, string>,
  user: { id?: string | null; email?: string | null },
): string | null {
  if (user.id && map[user.id]) return map[user.id];
  if (user.email && map[user.email.toLowerCase()]) return map[user.email.toLowerCase()];
  return null;
}
