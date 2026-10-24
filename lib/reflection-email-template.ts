import type { Locale } from "@/lib/i18n/locale";
import idMessages from "../messages/id/notifications.json" with { type: "json" };
import enMessages from "../messages/en/notifications.json" with { type: "json" };

const reflectionMessages = {
  id: idMessages.email.reflection,
  en: enMessages.email.reflection,
} as const;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);
}

export interface ReflectionEmailInput {
  locale: Locale;
  name: string;
  weekStart: string;
  completed: { quizzes: number; flashcards: number; modules: number };
  masteryGrowth: number;
  mostImproved: string | null;
  currentStreak: number;
  longestStreak: number;
}

/** Pure app-owned weekly reflection wrapper, rendered at dispatch for its recipient. */
export function renderReflectionEmail(input: ReflectionEmailInput): { subject: string; html: string } {
  const t = reflectionMessages[input.locale];
  const fill = (value: string, params: Record<string, string | number>) =>
    value.replace(/\{(\w+)\}/g, (_, key: string) => escapeHtml(String(params[key] ?? "")));
  const name = input.name;
  const weekStart = escapeHtml(input.weekStart);
  const growth = `${input.masteryGrowth > 0 ? "+" : ""}${input.masteryGrowth}%`;
  const mostImproved = input.mostImproved
    ? `<li>${t.mostImproved} <strong>${escapeHtml(input.mostImproved)}</strong></li>`
    : "";
  return {
    subject: fill(t.subject, { weekStart }),
    html: `<!DOCTYPE html><html lang="${input.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Zyx Academy</title></head>
      <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #0f172a;">
        <h1 style="font-size: 24px; margin-top: 0;">${fill(t.greeting, { name })}</h1>
        <p style="font-size: 16px; line-height: 1.5; color: #475569;">${t.intro} <strong>${weekStart}</strong>.</p>
        <section style="margin: 24px 0; padding: 16px; background: #f8fafc; border-radius: 8px;"><h2>${t.activity}</h2><ul>
          <li>${t.quizzes} <strong>${input.completed.quizzes}</strong></li><li>${t.flashcards} <strong>${input.completed.flashcards}</strong></li><li>${t.modules} <strong>${input.completed.modules}</strong></li>
        </ul></section>
        <section style="margin: 24px 0; padding: 16px; background: #f8fafc; border-radius: 8px;"><h2>${t.progress}</h2><ul>
          <li>${t.masteryGrowth} <strong>${escapeHtml(growth)}</strong></li>${mostImproved}
        </ul></section>
        <section style="margin: 24px 0; padding: 16px; background: #f8fafc; border-radius: 8px;"><h2>${t.streak}</h2><ul>
          <li>${t.currentStreak} <strong>${input.currentStreak} ${t.days}</strong></li><li>${t.longestStreak} <strong>${input.longestStreak} ${t.days}</strong></li>
        </ul></section>
        <p style="font-size: 14px; color: #64748b; text-align: center;">${t.outro} <strong>Zyx Academy</strong>.</p>
      </body></html>`,
  };
}
