import type { Locale } from "@/lib/i18n/locale";

// sRGB equivalents of the light theme in app/globals.css. Email clients
// cannot reliably render OKLCH, CSS variables, or Tailwind utilities.
export const emailColors = {
  primary: "#2a3c6a",
  foreground: "#333333",
  muted: "#717171",
  border: "#e0e0e0",
  background: "#fafafa",
  card: "#ffffff",
} as const;

const font = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
const headingFont = "'Lexend', " + font;

export const emailStyles = {
  heading: `font-family:${headingFont};font-size:24px;line-height:32px;font-weight:700;color:${emailColors.foreground};margin:0 0 16px;overflow-wrap:anywhere;`,
  paragraph: `font-family:${font};font-size:16px;line-height:26px;color:${emailColors.foreground};margin:0 0 16px;overflow-wrap:anywhere;`,
  muted: `font-family:${font};font-size:13px;line-height:20px;color:${emailColors.muted};margin:0;overflow-wrap:anywhere;`,
  link: `color:${emailColors.primary};font-weight:600;text-decoration:underline;`,
} as const;

export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]!);
}

// The optional sender inserts the localized unsubscribe copy here. The
// marker is inside the same bounded layout, outside the main content.
export const EMAIL_OPTIONAL_FOOTER_MARKER = "<!-- zyx-optional-email-footer -->";

export function renderEmailButton(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;"><tr>
    <td bgcolor="${emailColors.primary}" style="background-color:${emailColors.primary};border-radius:8px;mso-padding-alt:12px 20px;">
      <a href="${escapeEmailHtml(href)}" style="display:inline-block;padding:12px 20px;font-family:${font};font-size:14px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;mso-padding-alt:0;">${escapeEmailHtml(label)}</a>
    </td>
  </tr></table>`;
}

export function renderEmailDetails(rows: ReadonlyArray<{ label: string; value: string }>): string {
  if (!rows.length) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${emailColors.background}" style="width:100%;background-color:${emailColors.background};border:1px solid ${emailColors.border};border-radius:10px;margin:0 0 20px;table-layout:fixed;">
    ${rows.map((row, index) => `<tr><td style="padding:12px 16px;${index ? `border-top:1px solid ${emailColors.border};` : ""}overflow-wrap:anywhere;word-break:break-word;">
      <p style="${emailStyles.muted}">${escapeEmailHtml(row.label)}</p>
      <p style="${emailStyles.paragraph}margin:2px 0 0;font-weight:600;">${escapeEmailHtml(row.value)}</p>
    </td></tr>`).join("")}
  </table>`;
}

/** Trusted renderer markup only. Escape all recipient- or author-supplied values before interpolation. */
export function renderEmailLayout(input: {
  locale: Locale;
  bodyHtml: string;
  footerHtml?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="${input.locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Zyx Academy</title>
  <style>
    @media only screen and (max-width: 480px) {
      .zyx-email-outer { padding: 16px 12px !important; }
      .zyx-email-content { padding: 24px 20px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${emailColors.background};color:${emailColors.foreground};font-family:${font};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${emailColors.background}" style="width:100%;background-color:${emailColors.background};">
    <tr><td align="center" class="zyx-email-outer" style="padding:32px 16px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;table-layout:fixed;">
        <tr><td bgcolor="${emailColors.card}" style="background-color:${emailColors.card};border:1px solid ${emailColors.border};border-radius:14px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;">
            <tr><td class="zyx-email-content" style="padding:24px 32px 20px;border-bottom:1px solid ${emailColors.border};font-family:${headingFont};font-size:20px;line-height:28px;font-weight:700;color:${emailColors.primary};letter-spacing:-0.3px;">Zyx Academy</td></tr>
            <tr><td class="zyx-email-content" style="padding:28px 32px 32px;font-family:${font};font-size:16px;line-height:26px;color:${emailColors.foreground};overflow-wrap:anywhere;word-break:break-word;">
              ${input.bodyHtml}
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 8px 0;text-align:left;">
          ${input.footerHtml ?? ""}
          ${EMAIL_OPTIONAL_FOOTER_MARKER}
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}
