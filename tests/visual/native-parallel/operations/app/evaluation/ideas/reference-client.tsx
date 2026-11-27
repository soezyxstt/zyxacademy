"use client";

import { useState, useSyncExternalStore } from "react";
import { NextIntlClientProvider } from "next-intl";
import { IdeaAssignmentFields } from "@/app/(admin)/admin/(eval)/questions/idea-assignment-fields";
import type { QuestionIdeaLink } from "@/lib/question-authoring-contract";
import { evaluationIdeas } from "@/packages/native-parity/operations/evaluation-fixtures";
import adminEval from "@/messages/id/adminEval.json";
import core from "@/messages/id/core.json";
import ui from "@/messages/id/ui.json";

const subscribe = () => () => {};
async function readIdeas(courseId: string, chapterId: string) {
  return courseId === "mekanika-dasar" && chapterId === "bab-usaha" ? evaluationIdeas : [];
}

export function IdeaAssignmentFixture() {
  const [links, setLinks] = useState<QuestionIdeaLink[]>([]);
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  return <NextIntlClientProvider locale="id" messages={{ adminEval, core, ui }} timeZone="Asia/Jakarta">
    <div data-fixture-ready={ready}>
      <IdeaAssignmentFields idPrefix="fixture" open courseId="mekanika-dasar" chapterId="bab-usaha" links={links} onChange={setLinks} readIdeas={readIdeas} />
    </div>
  </NextIntlClientProvider>;
}
