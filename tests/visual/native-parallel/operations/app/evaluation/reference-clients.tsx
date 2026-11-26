"use client";
import { useSyncExternalStore } from "react";
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

const subscribe = () => () => {};

export function JobsFixture({ snapshot }: { snapshot: GenerationJobs }) {
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const jobs = snapshot.jobs.map((job) => ({ ...job, createdAt: new Date(job.createdAt), updatedAt: new Date(job.updatedAt) }));
  return <NextIntlClientProvider locale="id" messages={{ adminEval, ui, common }} timeZone="UTC"><div data-fixture-ready={ready}><GenerationJobsClient {...snapshot} jobs={jobs} /></div></NextIntlClientProvider>;
}
