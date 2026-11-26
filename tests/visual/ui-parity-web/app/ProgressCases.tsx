import { Progress } from "@/components/ui/progress";
import { getProgressPosition, type ProgressCaseSpec } from "@/packages/ui-parity/progress-cases";

export function ProgressCase({ item }: { item: ProgressCaseSpec }) {
  return (
    <div style={getProgressPosition()}>
      <Progress aria-label={item.label} value={item.value} max={item.max} />
    </div>
  );
}
