import { View } from "react-native";

import { getProgressPosition, type ProgressCaseSpec } from "../../packages/ui-parity/progress-cases";
import { Progress } from "./components/Progress";

export function ProgressCase({ item }: { item: ProgressCaseSpec }) {
  return (
    <View style={getProgressPosition()}>
      <Progress
        accessibilityLabel={item.label}
        testID={`${item.id}-bar`}
        theme={item.theme}
        value={item.value}
        max={item.max}
      />
    </View>
  );
}
