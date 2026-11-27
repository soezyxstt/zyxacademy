import { z } from "zod";

export const accountSessionsPath = "/api/account/sessions";
const deviceSession = z.object({
  id: z.string().min(1).max(256), label: z.string(), current: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }),
});
export function accountSessions(raw: unknown, activeId?: string) {
  const parsed = z.object({ sessions: z.array(deviceSession) }).safeParse(raw);
  if (!parsed.success) return null;
  const rows = parsed.data.sessions;
  const active = rows.filter(row => row.current);
  if (active.length !== 1 || (activeId && active[0].id !== activeId) || new Set(rows.map(row => row.id)).size !== rows.length) return null;
  return rows;
}
