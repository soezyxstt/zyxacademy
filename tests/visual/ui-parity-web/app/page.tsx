import { Separator } from "@/components/ui/separator";
import { getSeparatorPosition, separatorCases, separatorFrame } from "@/packages/ui-parity/separator-cases";

export default function ParityPage() {
  return (
    <main style={{ display: "grid", justifyContent: "center", gap: separatorFrame.gap, paddingBlock: separatorFrame.gap }}>
      {separatorCases.map(({ id, orientation, theme }) => (
        <div
          key={id}
          className={theme === "dark" ? "dark bg-background" : "bg-background"}
          data-parity-case={id}
          style={{ position: "relative", width: separatorFrame.width, height: separatorFrame.height }}
        >
          <div style={getSeparatorPosition(orientation)}>
            <Separator orientation={orientation} />
          </div>
        </div>
      ))}
    </main>
  );
}
