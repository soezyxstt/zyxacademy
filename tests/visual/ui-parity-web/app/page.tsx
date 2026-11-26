import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { parityFrame } from "@/packages/ui-parity/frame";
import { getSeparatorPosition, separatorCases } from "@/packages/ui-parity/separator-cases";
import { getSkeletonPosition, skeletonCases } from "@/packages/ui-parity/skeleton-cases";

type ParityCaseFrameProps = { id: string; theme: "light" | "dark"; children: ReactNode };

function ParityCaseFrame({ id, theme, children }: ParityCaseFrameProps) {
  return (
    <div
      className={theme === "dark" ? "dark bg-background" : "bg-background"}
      data-parity-case={id}
      style={{ position: "relative", width: parityFrame.width, height: parityFrame.height }}
    >
      {children}
    </div>
  );
}

export default function ParityPage() {
  return (
    <main style={{ display: "grid", justifyContent: "center", gap: parityFrame.gap, paddingBlock: parityFrame.gap }}>
      {separatorCases.map(({ id, orientation, theme }) => (
        <ParityCaseFrame key={id} id={id} theme={theme}>
          <div style={getSeparatorPosition(orientation)}>
            <Separator orientation={orientation} />
          </div>
        </ParityCaseFrame>
      ))}
      {skeletonCases.map(({ id, theme, width, height }) => (
        <ParityCaseFrame key={id} id={id} theme={theme}>
          <Skeleton style={getSkeletonPosition(width, height)} />
        </ParityCaseFrame>
      ))}
    </main>
  );
}
