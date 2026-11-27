"use client";

import { NextIntlClientProvider } from "next-intl";
import { PublicFormViewer } from "@/components/forms/public-form-viewer";
import publicForms from "@/messages/id/publicForms.json";
import ui from "@/messages/id/ui.json";

export function PublicFormReference({ id, shortEntry }: { id: string; shortEntry: boolean }) {
  return <div lang="id">
    <NextIntlClientProvider locale="id" timeZone="Asia/Jakarta" messages={{ publicForms, ui }}>
      <PublicFormViewer idOrSlug={id} shortEntry={shortEntry} />
    </NextIntlClientProvider>
  </div>;
}
