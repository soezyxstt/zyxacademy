import { PKA_COURSE_ID } from "@/lib/pka-config";
import { getPublicAppUrl } from "@/lib/public-app-url";
import type { Locale } from "@/lib/i18n/locale";
import idMessages from "../messages/id/notifications.json" with { type: "json" };
import enMessages from "../messages/en/notifications.json" with { type: "json" };

import { emailStyles, escapeEmailHtml as escapeHtml, renderEmailButton, renderEmailDetails, renderEmailLayout } from "@/lib/notifications/email-layout";

const emailMessages = { id: idMessages.email, en: enMessages.email } as const;

function interpolate(template: string, value: string, key: string): string {
  return template.replace(`{${key}}`, () => value);
}

function parseInline(text: string): string {
  let escaped = escapeHtml(text);

  // Link: [text](url)
  escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (match, linkText, url) => {
    return `<a href="${url}" style="color: #2a3c6a; font-weight: 600; text-decoration: underline;">${linkText}</a>`;
  });

  // Bold/Strong: **text** and __text__
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  escaped = escaped.replace(/__([^_]+)__/g, "<strong>$1</strong>");

  // Italic: *text* and _text_
  escaped = escaped.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  escaped = escaped.replace(/_([^_]+)_/g, "<em>$1</em>");

  // Inline code: `code`
  escaped = escaped.replace(/`([^`]+)`/g, '<code style="background-color: #f4f4f4; padding: 2px 4px; border-radius: 4px; font-size: 13px; font-family: monospace; color: #333333;">$1</code>');

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
        `<p style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333333; margin: 12px 0;">${text}</p>`
      );
      currentParagraphLines = [];
    }
  };

  const flushList = () => {
    if (inList) {
      const tag = inList;
      const listStyle = 'style="font-family: \'Inter\', -apple-system, BlinkMacSystemFont, \'Segoe UI\', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333333; padding-left: 24px; margin: 12px 0;"';
      
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
        `<blockquote style="border-left: 4px solid #e0e0e0; padding-left: 16px; margin: 16px 0; color: #333333; font-style: italic;">${text}</blockquote>`
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
          `<pre style="background-color: #fafafa; border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px 16px; margin: 16px 0; overflow-x: auto; font-family: monospace; font-size: 14px; color: #333333; line-height: 1.4;"><code>${codeText}</code></pre>`
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
      htmlBlocks.push(`<hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 24px 0;" />`);
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
        `<h${level} style="font-family: 'Lexend', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: ${fontSize}; color: #333333; margin: ${marginTop} 0 ${marginBottom}; font-weight: 700; line-height: 1.25;">${parseInline(headingText)}</h${level}>`
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
  return renderEmailLayout({
    locale,
    bodyHtml: inner,
    footerHtml: `<p style="${emailStyles.muted}">${emailMessages[locale].pkaDisclaimer}</p>`,
  });
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
    ? renderEmailButton(text.join, meetLink)
    : `<p style="margin: 8px 0 0; font-size: 14px; color: #717171;">${text.meetPending}</p>`;

  return emailShell(`
    <h1 style="${emailStyles.heading}">${escapeHtml(title)}</h1>
    <p style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 16px; line-height: 1.5; color: #333333;">${text.intro}</p>
    ${renderEmailDetails([{ label: text.scheduleLabel.replace(/:\s*$/, ""), value: `${sessionLabel} WIB` }])}
    <div style="margin: 0 0 20px;">${meetBlock}</div>
    <p style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 14px; color: #333333;">
      ${text.courseLinkIntro}
      <a href="${getPublicAppUrl()}/courses/${PKA_COURSE_ID}/jadwal" style="color: #2a3c6a; font-weight: 600; text-decoration: underline;">${text.courseLink}</a>.
    </p>
  `, locale);
}

/** Email for a Markdown announcement broadcast. */
export function pkaAnnouncementEmailHtml(title: string, markdownBody: string, locale: Locale = "id"): string {
  const text = emailMessages[locale].announcement;
  return emailShell(`
    <h1 style="${emailStyles.heading}">${escapeHtml(title)}</h1>
    ${markdownToEmailHtml(markdownBody)}
    <p style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 14px; color: #333333; margin-top: 28px; line-height: 1.5;">
      ${text.courseLinkIntro}
      <a href="${getPublicAppUrl()}/courses/${PKA_COURSE_ID}" style="color: #2a3c6a; font-weight: 600; text-decoration: underline;">${text.courseLink}</a>
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
