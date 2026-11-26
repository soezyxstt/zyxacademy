"use client";

import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import admin from "@/messages/id/admin.json";
import adminForms from "@/messages/id/adminForms.json";
import adminOps from "@/messages/id/adminOps.json";
import learning from "@/messages/id/learning.json";
import ui from "@/messages/id/ui.json";

export function ManagementReferenceProviders({ children }: { children: ReactNode }) {
  return <NextIntlClientProvider locale="id" messages={{ admin, adminForms, adminOps, learning, ui }} timeZone="UTC">{children}</NextIntlClientProvider>;
}
