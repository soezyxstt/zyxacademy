import { PKA_COURSE_ID } from "@/lib/pka-config";
import { getPublicAppUrl } from "@/lib/public-app-url";
import type { Locale } from "@/lib/i18n/locale";
import idMessages from "../messages/id/notifications.json" with { type: "json" };
import enMessages from "../messages/en/notifications.json" with { type: "json" };

const emailMessages = { id: idMessages.email, en: enMessages.email } as const;

function interpolate(template: string, value: string, key: string): string {
  return template.replace(`{${key}}`, () => value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseInline(text: string): string {
  let escaped = escapeHtml(text);

  // Link: [text](url)
  escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (match, linkText, url) => {
    return `<a href="${url}" style="color: #2563eb; font-weight: 600; text-decoration: none;">${linkText}</a>`;
  });

  // Bold/Strong: **text** and __text__
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  escaped = escaped.replace(/__([^_]+)__/g, "<strong>$1</strong>");

  // Italic: *text* and _text_
  escaped = escaped.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  escaped = escaped.replace(/_([^_]+)_/g, "<em>$1</em>");

  // Inline code: `code`
  escaped = escaped.replace(/`([^`]+)`/g, '<code style="background-color: #f1f5f9; padding: 2px 4px; border-radius: 4px; font-size: 13px; font-family: monospace; color: #0f172a;">$1</code>');

  return escaped;
}

/**
 * Robust Markdown-to-HTML parser for email announcements.
 * Converts headings, lists, blockquotes, code blocks, and basic inline formatting.
 */
function markdownToEmailHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const htmlBlocks: string[] = [];

  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  let inList: "ul" | "ol" | null = null;
  let listItems: string[] = [];

  let inBlockquote = false;
  let blockquoteLines: string[] = [];

  let currentParagraphLines: string[] = [];

  const flushParagraph = () => {
    if (currentParagraphLines.length > 0) {
      const text = currentParagraphLines.map(parseInline).join("<br />");
      htmlBlocks.push(
        `<p style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 15px; line-height: 1.6; color: #334155; margin: 12px 0;">${text}</p>`
      );
      currentParagraphLines = [];
    }
  };

  const flushList = () => {
    if (inList) {
      const tag = inList;
      const listStyle = 'style="font-family: \'Inter\', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 15px; line-height: 1.6; color: #334155; padding-left: 24px; margin: 12px 0;"';
      
      const itemsHtml = listItems
        .map(
          (item) =>
            `<li style="margin: 6px 0; padding-left: 4px;">${parseInline(item)}</li>`
        )
        .join("");

      htmlBlocks.push(`<${tag} ${listStyle}>${itemsHtml}</${tag}>`);
      listItems = [];
      inList = null;
    }
  };

  const flushBlockquote = () => {
    if (inBlockquote) {
      const text = blockquoteLines.map(parseInline).join("<br />");
      htmlBlocks.push(
        `<blockquote style="border-left: 4px solid #e2e8f0; padding-left: 16px; margin: 16px 0; color: #475569; font-style: italic;">${text}</blockquote>`
      );
      blockquoteLines = [];
      inBlockquote = false;
    }
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
    flushBlockquote();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Fenced Code Block
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        inCodeBlock = false;
        const codeText = escapeHtml(codeBlockLines.join("\n"));
        htmlBlocks.push(
          `<pre style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin: 16px 0; overflow-x: auto; font-family: monospace; font-size: 14px; color: #0f172a; line-height: 1.4;"><code>${codeText}</code></pre>`
        );
        codeBlockLines = [];
      } else {
        flushAll();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // 2. Horizontal Rule
    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      flushAll();
      htmlBlocks.push(`<hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />`);
      continue;
    }

    // 3. Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushAll();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();
      
      let fontSize = "16px";
      let marginTop = "20px";
      let marginBottom = "8px";
      
      if (level === 1) {
        fontSize = "22px";
        marginTop = "24px";
        marginBottom = "12px";
      } else if (level === 2) {
        fontSize = "19px";
        marginTop = "22px";
        marginBottom = "10px";
      } else if (level === 3) {
        fontSize = "17px";
        marginTop = "20px";
        marginBottom = "8px";
      } else {
        fontSize = "15px";
        marginTop = "18px";
        marginBottom = "6px";
      }

      htmlBlocks.push(
        `<h${level} style="font-family: 'Lexend', -apple-system, BlinkMacSystemFont, sans-serif; font-size: ${fontSize}; color: #0f172a; margin: ${marginTop} 0 ${marginBottom}; font-weight: 700; line-height: 1.25;">${parseInline(headingText)}</h${level}>`
      );
      continue;
    }

    // 4. Blockquotes
    if (trimmed.startsWith(">")) {
      if (!inBlockquote) {
        flushAll();
        inBlockquote = true;
      }
      const content = trimmed.slice(1).replace(/^\s/, "");
      blockquoteLines.push(content);
      continue;
    }

    // 5. Unordered List Items
    const ulMatch = trimmed.match(/^([-*+])\s+(.*)$/);
    if (ulMatch) {
      if (inList !== "ul") {
        flushAll();
        inList = "ul";
      }
      listItems.push(ulMatch[2].trim());
      continue;
    }

    // 6. Ordered List Items
    const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (olMatch) {
      if (inList !== "ol") {
        flushAll();
        inList = "ol";
      }
      listItems.push(olMatch[2].trim());
      continue;
    }

    // 7. Blank Line
    if (trimmed === "") {
      flushAll();
      continue;
    }

    // 8. Normal Paragraph Line
    if (inList || inBlockquote) {
      flushAll();
    }
    currentParagraphLines.push(trimmed);
  }

  flushAll();

  return htmlBlocks.join("\n");
}

function emailShell(inner: string, locale: Locale): string {
  const languageText = emailMessages[locale];
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zyx Academy</title>
  <style>
    body, p, li, blockquote, pre, code {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    h1, h2, h3, h4, h5, h6 {
      font-family: 'Lexend', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
  </style>
</head>
<body style="background-color: #f8fafc; margin: 0; padding: 24px 12px; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <div style="max-width: 600px; margin: 0 auto; padding: 32px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);">
    <div style="margin-bottom: 28px; padding-bottom: 16px; border-bottom: 1px solid #f1f5f9;">
      <span style="font-family: 'Lexend', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">
        Zyx <span style="color: #2563eb;">Academy</span>
      </span>
    </div>
    
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;">
      ${inner}
    </div>
    
    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
    <p style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 12px; color: #64748b; line-height: 1.5; margin: 0;">
      ${languageText.pkaDisclaimer}
    </p>
  </div>
</body>
</html>`;
}

/** Email for a live tutorial schedule. Omits the join button when the Meet link is not set yet. */
export function scheduleEmailHtml(title: string, sessionAt: Date, meetLink: string | null, locale: Locale = "id"): string {
  const text = emailMessages[locale].schedule;
  const sessionLabel = sessionAt.toLocaleString(locale === "en" ? "en-US" : "id-ID", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });
  const meetBlock = meetLink
    ? `<a href="${escapeHtml(meetLink)}" style="display: inline-block; margin-top: 8px; padding: 10px 20px; background-color: #2563eb; color: #ffffff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">${text.join}</a>`
    : `<p style="margin: 8px 0 0; font-size: 14px; color: #64748b;">${text.meetPending}</p>`;

  return emailShell(`
    <h1 style="font-family: 'Lexend', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 22px; color: #0f172a; margin-top: 0; font-weight: 700;">${escapeHtml(title)}</h1>
    <p style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 16px; line-height: 1.5; color: #475569;">${text.intro}</p>
    <div style="margin: 24px 0; padding: 16px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
      <p style="margin: 0 0 8px 0; font-size: 15px; color: #334155;"><strong>${text.scheduleLabel}</strong> ${sessionLabel} WIB</p>
      ${meetBlock}
    </div>
    <p style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; color: #475569;">
      ${text.courseLinkIntro}
      <a href="${getPublicAppUrl()}/courses/${PKA_COURSE_ID}/jadwal" style="color: #2563eb; font-weight: 600; text-decoration: none;">${text.courseLink}</a>.
    </p>
  `, locale);
}

/** Email for a Markdown announcement broadcast. */
export function pkaAnnouncementEmailHtml(title: string, markdownBody: string, locale: Locale = "id"): string {
  const text = emailMessages[locale].announcement;
  return emailShell(`
    <h1 style="font-family: 'Lexend', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 22px; color: #0f172a; margin-top: 0; font-weight: 700; line-height: 1.25; margin-bottom: 16px;">${escapeHtml(title)}</h1>
    ${markdownToEmailHtml(markdownBody)}
    <p style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; color: #475569; margin-top: 28px; line-height: 1.5;">
      ${text.courseLinkIntro}
      <a href="${getPublicAppUrl()}/courses/${PKA_COURSE_ID}" style="color: #2563eb; font-weight: 600; text-decoration: none;">${text.courseLink}</a>
    </p>
  `, locale);
}

export function pkaScheduleEmailSubject(title: string, locale: Locale): string {
  return interpolate(emailMessages[locale].schedule.subject, title, "title");
}

export function pkaAnnouncementEmailSubject(title: string, locale: Locale): string {
  return interpolate(emailMessages[locale].announcement.subject, title, "title");
}

export function pkaScheduleUpdateEmailSubject(title: string, locale: Locale): string {
  return interpolate(emailMessages[locale].scheduleUpdateSubject, title, "title");
}
