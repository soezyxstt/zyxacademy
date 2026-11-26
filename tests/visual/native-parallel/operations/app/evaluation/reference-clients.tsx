"use client";
import { NextIntlClientProvider } from "next-intl";
import { ASTInspectorClient } from "@/app/(admin)/admin/(content)/ast-inspector/ast-inspector-client";
import { GenerationJobsClient } from "@/app/(admin)/admin/(eval)/jobs/jobs-client";
import type { GenerationJobs } from "@/packages/native-parity/operations/evaluation-contract";
import adminEval from "@/messages/id/adminEval.json";
import adminOps from "@/messages/id/adminOps.json";

import ui from "@/messages/id/ui.json";
import common from "@/messages/id/common.json";

export function AstInspectorFixture() {
  return <NextIntlClientProvider locale="id" messages={{ adminOps, ui, common }} timeZone="UTC"><ASTInspectorClient /></NextIntlClientProvider>;
}

export function JobsFixture({ snapshot }: { snapshot: GenerationJobs }) {
  const jobs = snapshot.jobs.map((job) => ({ ...job, createdAt: new Date(job.createdAt), updatedAt: new Date(job.updatedAt) }));
  return <NextIntlClientProvider locale="id" messages={{ adminEval, ui, common }} timeZone="UTC"><GenerationJobsClient {...snapshot} jobs={jobs} /></NextIntlClientProvider>;
}
