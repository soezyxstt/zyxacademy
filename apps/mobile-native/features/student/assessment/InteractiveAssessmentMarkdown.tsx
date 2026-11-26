import { View } from "react-native";
import type { InteractiveDocumentScope } from "../../../../../lib/materials/interactive-document-path";
import { interactiveMarkdown } from "../../../../../lib/materials/interactive-document-display";
import { InteractiveVisual } from "../InteractiveDocument";
import { Markdown, useAssessment } from "./ui";

export function InteractiveAssessmentMarkdown({ value, scope }: { value: string; scope: InteractiveDocumentScope | null }) {
  const parts = interactiveMarkdown(value);
  const { session, request } = useAssessment();
  if (!parts.some(part => typeof part !== "string")) return <Markdown value={value} />;
  return <View style={{ gap: 8 }}>
    {parts.map((part, index) => typeof part === "string"
      ? <Markdown key={index} value={part} />
      : <InteractiveVisual key={`${part.id}:${index}`} source={{ spec: part, scope }} locale={session.locale} request={request} />)}
  </View>;
}
