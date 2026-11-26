import type { Locale } from "@/lib/i18n/locale";
import idMessages from "../messages/id/notifications.json" with { type: "json" };
import enMessages from "../messages/en/notifications.json" with { type: "json" };

import { emailColors, emailStyles, escapeEmailHtml as escapeHtml, renderEmailDetails, renderEmailLayout } from "@/lib/notifications/email-layout";

const reflectionMessages = {
  id: idMessages.email.reflection,
  en: enMessages.email.reflection,
} as const;

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
  const subject = t.subject.replace("{weekStart}", () => input.weekStart);
  const growth = `${input.masteryGrowth > 0 ? "+" : ""}${input.masteryGrowth}%`;
  const section = (title: string, rows: Array<{ label: string; value: string }>) => `
    <h2 style="font-size:16px;line-height:24px;font-weight:600;color:${emailColors.foreground};margin:24px 0 8px;">${escapeHtml(title)}</h2>
    ${renderEmailDetails(rows.map(row => ({ ...row, label: row.label.replace(/:\s*$/, "") })))}
  `;
  return {
    subject,
    html: renderEmailLayout({
      locale: input.locale,
      bodyHtml: `<h1 style="${emailStyles.heading}">${escapeHtml(subject)}</h1>
        <p style="${emailStyles.paragraph}">${fill(t.greeting, { name: input.name })}</p>
        <p style="${emailStyles.paragraph}">${t.intro} <strong>${escapeHtml(input.weekStart)}</strong>.</p>
        ${section(t.activity, [
          { label: t.quizzes, value: String(input.completed.quizzes) },
          { label: t.flashcards, value: String(input.completed.flashcards) },
          { label: t.modules, value: String(input.completed.modules) },
        ])}
        ${section(t.progress, [
          { label: t.masteryGrowth, value: growth },
          ...(input.mostImproved ? [{ label: t.mostImproved, value: input.mostImproved }] : []),
        ])}
        ${section(t.streak, [
          { label: t.currentStreak, value: `${input.currentStreak} ${t.days}` },
          { label: t.longestStreak, value: `${input.longestStreak} ${t.days}` },
        ])}
        <p style="${emailStyles.paragraph}margin-bottom:0;">${t.outro} <strong>Zyx Academy</strong>.</p>`,
    }),
  };
}
