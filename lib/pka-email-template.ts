import { PKA_COURSE_ID, PKA_DISCLAIMER } from "@/lib/pka-config";
import { getPublicAppUrl } from "@/lib/public-app-url";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Minimal Markdown-to-HTML for announcement emails. Input is escaped first;
 * only bold, italic, inline code, safe links, headings, and lists survive.
 */
function markdownToEmailHtml(markdown: string): string {
  const inline = (text: string) =>
    text
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" style="color: #2563eb; font-weight: 600; text-decoration: none;">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, '<code style="background-color: #f1f5f9; padding: 1px 5px; border-radius: 4px; font-size: 14px;">$1</code>');

  const blocks = escapeHtml(markdown).split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) return "";

      const heading = lines[0].match(/^(#{1,6})\s+(.*)$/);
      if (heading && lines.length === 1) {
        return `<h2 style="font-family: 'Lexend', sans-serif; font-size: 18px; color: #0f172a; margin: 20px 0 8px; font-weight: 700;">${inline(heading[2])}</h2>`;
      }

      if (lines.every((l) => /^[-*]\s+/.test(l))) {
        const items = lines
          .map((l) => `<li style="margin: 4px 0;">${inline(l.replace(/^[-*]\s+/, ""))}</li>`)
          .join("");
        return `<ul style="font-size: 16px; line-height: 1.5; color: #475569; padding-left: 20px; margin: 8px 0;">${items}</ul>`;
      }

      return `<p style="font-size: 16px; line-height: 1.5; color: #475569; margin: 8px 0;">${lines.map(inline).join("<br />")}</p>`;
    })
    .join("");
}

function emailShell(inner: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
      ${inner}
      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
      <p style="font-size: 13px; color: #64748b; line-height: 1.4;">${PKA_DISCLAIMER}</p>
    </div>
  `;
}

/** Email for a live tutorial schedule. Omits the join button when the Meet link is not set yet. */
export function scheduleEmailHtml(title: string, sessionAt: Date, meetLink: string | null): string {
  const sessionLabel = sessionAt.toLocaleString("id-ID", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });
  const meetBlock = meetLink
    ? `<a href="${escapeHtml(meetLink)}" style="display: inline-block; margin-top: 8px; padding: 10px 20px; background-color: #2563eb; color: #ffffff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Gabung Google Meet</a>`
    : `<p style="margin: 8px 0 0; font-size: 14px; color: #64748b;">Link Google Meet akan dibagikan sebelum sesi dimulai.</p>`;

  return emailShell(`
    <h1 style="font-family: 'Lexend', sans-serif; font-size: 22px; color: #0f172a; margin-top: 0; font-weight: 700;">${escapeHtml(title)}</h1>
    <p style="font-size: 16px; line-height: 1.5; color: #475569;">Sesi tutorial live PKA baru telah dijadwalkan.</p>
    <div style="margin: 24px 0; padding: 16px; background-color: #f8fafc; border-radius: 8px;">
      <p style="margin: 0 0 8px 0; font-size: 15px; color: #334155;"><strong>Jadwal:</strong> ${sessionLabel} WIB</p>
      ${meetBlock}
    </div>
    <p style="font-size: 14px; color: #475569;">
      Jadwal lengkap, simulasi kuis, dan materi tersedia di
      <a href="${getPublicAppUrl()}/courses/${PKA_COURSE_ID}/jadwal" style="color: #2563eb; font-weight: 600; text-decoration: none;">halaman Tutorial PKA</a>.
    </p>
  `);
}

/** Email for a Markdown announcement broadcast. */
export function pkaAnnouncementEmailHtml(title: string, markdownBody: string): string {
  return emailShell(`
    <h1 style="font-family: 'Lexend', sans-serif; font-size: 22px; color: #0f172a; margin-top: 0; font-weight: 700;">${escapeHtml(title)}</h1>
    ${markdownToEmailHtml(markdownBody)}
    <p style="font-size: 14px; color: #475569; margin-top: 24px;">
      Cek halaman kursus untuk informasi lebih lanjut:
      <a href="${getPublicAppUrl()}/courses/${PKA_COURSE_ID}" style="color: #2563eb; font-weight: 600; text-decoration: none;">Buka Tutorial PKA</a>
    </p>
  `);
}
