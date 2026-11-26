import { ApplicationPage } from "@/components/application-page";
import { notFound } from "next/navigation";
import { sharedUiCases } from "@/packages/native-parity/shared-ui/cases";
import { ControlReferences } from "../../ControlReferences";
import { DataReferences } from "../../DataReferences";
import { LayoutReferences } from "../../LayoutReferences";
import { NavigationReferences } from "../../NavigationReferences";

export default async function ReferencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const fixture = sharedUiCases.find((item) => item.id === id);
  if (!fixture) notFound();
  const Renderer = {
    layout: LayoutReferences,
    data: DataReferences,
    controls: ControlReferences,
    navigation: NavigationReferences,
  }[fixture.family];
  const inPage =
    fixture.family === "data" ||
    fixture.family === "controls" ||
    ["navigation-tabs", "shared-popover"].includes(fixture.component);
  const content = <Renderer id={id} />;
  return (
    <div
      data-reference={id}
      className="min-h-dvh bg-background text-foreground"
    >
      {inPage ? <ApplicationPage>{content}</ApplicationPage> : content}
    </div>
  );
}
