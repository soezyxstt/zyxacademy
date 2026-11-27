import { galleryCases, type GalleryCase } from "@/packages/ui-parity/gallery";
import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getParityFrameHeight, parityFrame } from "@/packages/ui-parity/frame";
import { getSeparatorPosition } from "@/packages/ui-parity/separator-cases";
import { getSkeletonPosition } from "@/packages/ui-parity/skeleton-cases";

import { AlertCase } from "./AlertCases";
import { AvatarCase } from "./AvatarCases";
import { BadgeCase, BetaBadgeCase } from "./BadgeCases";
import { RadioCase } from "./RadioCases";
import { ProgressCase } from "./ProgressCases";
import { ChoiceCase } from "./ChoiceCases";
import { ControlCase } from "./ControlCases";
import { FormattedDateCase } from "./FormattedDateCases";
import { NotificationInboxCase } from "./NotificationInboxCases";
import { SliderCase } from "./SliderCases";
import { ToggleGroupCase } from "./ToggleGroupCases";
import { MobileReference } from "./MobileReference";

type ParityCaseFrameProps = { id: string; theme: "light" | "dark"; height: number; children: ReactNode };

function ParityCaseFrame({ id, theme, height, children }: ParityCaseFrameProps) {
  return (
    <div
      className={theme === "dark" ? "dark bg-background text-foreground" : "bg-background text-foreground"}
      data-parity-case={id}
      style={{ position: "relative", width: parityFrame.width, height }}
    >
      {children}
    </div>
  );
}

function Specimen({ item }: { item: GalleryCase }) {
  switch (item.family) {
    case "control":
      return <ControlCase id={item.id} />;
    case "radio":
      return <RadioCase id={item.id} />;
    case "alert":
      return <AlertCase item={item} />;
    case "avatar":
      return <AvatarCase item={item} />;
    case "badge":
      return <BadgeCase item={item} />;
    case "beta-badge":
      return <BetaBadgeCase item={item} />;
    case "progress":
      return <ProgressCase item={item} />;
    case "formatted-date":
      return <FormattedDateCase item={item} />;
    case "notification-inbox":
      return <NotificationInboxCase item={item} />;
    case "slider":
      return <SliderCase item={item} />;
    case "toggle-group":
      return <ToggleGroupCase item={item} />;
    case "choice":
      return <ChoiceCase id={item.id} />;
    case "skeleton":
      return <Skeleton style={getSkeletonPosition(item.width, item.height)} />;
    case "separator":
      return (
        <div style={getSeparatorPosition(item.orientation)}>
          {item.orientation === "vertical" ? (
            <Separator orientation={item.orientation} decorative={false} aria-label="Pemisah bagian" />
          ) : (
            <Separator orientation={item.orientation} />
          )}
        </div>
      );
  }
}

export default function ParityPage() {
  return (
    <>
      <main style={{ display: "grid", justifyContent: "center", gap: parityFrame.gap, paddingBlock: parityFrame.gap }}>
        {galleryCases.map((item) => (
          <ParityCaseFrame key={item.id} id={item.id} theme={item.theme} height={getParityFrameHeight(item.id)}>
            <Specimen item={item} />
          </ParityCaseFrame>
        ))}
      </main>
      <MobileReference />
    </>
  );
}
