import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { loadMessages } from "@/lib/i18n/catalogs";

const messages = await loadMessages("id");

export function renderWithMessages(element: ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="id" timeZone="Asia/Jakarta" messages={messages}>
      {element}
    </NextIntlClientProvider>,
  );
}
