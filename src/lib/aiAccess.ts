import { useAuth } from '@/contexts/AuthContext';
import { AI_MODULES } from '@/config/permissions';

export type AiAccess = { teaching: boolean; guide: boolean; coworker: boolean; adviser: boolean };

/**
 * Which AI assistants this user may use right now. Set in Access Management: for a whole company (Full off) or per user
 * (AI Assistants rows). Follows the logged-in user and the company being used, and updates as soon as permissions reload.
 */
export function useAiAccess(): AiAccess {
  const { canView, permissions } = useAuth();
  if (!permissions) return { teaching: false, guide: false, coworker: false, adviser: false };
  return {
    teaching: canView(AI_MODULES.teaching),
    guide: canView(AI_MODULES.guide),
    coworker: canView(AI_MODULES.coworker),
    adviser: canView(AI_MODULES.adviser),
  };
}
