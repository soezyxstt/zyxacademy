import React from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { PublicFormViewer } from "@/components/forms/public-form-viewer";
import { Toaster } from "@/components/ui/toast";
import enForms from "@/messages/en/publicForms.json";
import enUi from "@/messages/en/ui.json";
import publicForms from "@/messages/id/publicForms.json";
import ui from "@/messages/id/ui.json";

const english = new URLSearchParams(location.search).get("lang") === "en";
const preview = new URLSearchParams(location.search).has("preview");
const form = {
  id: "fixture-id", slug: "fixture-slug", title: "Pendaftaran tutorial", category: "registration",
  settings: { displayMode: "section" as const },
  questions: [{ type: "FILE_UPLOAD", title: "Berkas pendukung", maxFileSizeMb: 5, allowedFileTypes: ["application/pdf" as const] }],
};

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale={english ? "en" : "id"} timeZone="UTC" messages={english ? { publicForms: enForms, ui: enUi } : { publicForms, ui }}>
    <PublicFormViewer idOrSlug="fixture-slug" isPreview={preview} previewForm={preview ? form : undefined} />
    <Toaster />
  </NextIntlClientProvider>,
);
