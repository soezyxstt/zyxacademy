import React from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { PublicFormViewer } from "@/components/forms/public-form-viewer";
import { Toaster } from "@/components/ui/toast";
import publicForms from "@/messages/id/publicForms.json";
import ui from "@/messages/id/ui.json";

const id = decodeURIComponent(location.pathname.split("/").at(-1) ?? "");

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="id" timeZone="Asia/Jakarta" messages={{ publicForms, ui }}>
    <PublicFormViewer idOrSlug={id} />
    <Toaster />
  </NextIntlClientProvider>,
);
