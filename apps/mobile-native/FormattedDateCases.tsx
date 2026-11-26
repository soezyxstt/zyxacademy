import { Text, View } from "react-native";

import { nativeColors } from "../../packages/design-tokens/native-colors";
import { getFormattedDatePosition, type FormattedDateCaseSpec } from "../../packages/ui-parity/formatted-date-cases";
import { FormattedDate } from "./components/FormattedDate";
import { nativeTypography } from "./typography";

export function FormattedDateCase({ item }: { item: FormattedDateCaseSpec }) {
  const colors = nativeColors[item.theme];
  const textStyle = item.role === "label"
    ? { ...nativeTypography.bodySemibold, color: colors.foreground, fontSize: 14, lineHeight: 20 }
    : { ...nativeTypography.bodyRegular, color: colors.mutedForeground, fontSize: 12, lineHeight: 18 };
  return (
    <View style={[getFormattedDatePosition(), { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap" }]}>
      <Text style={[textStyle, { includeFontPadding: false }]}>{item.prefix}</Text>
      <FormattedDate date={item.date} locale={"locale" in item ? item.locale : "id-ID"} options={item.options}
        style={[textStyle, { includeFontPadding: false }]} testID={`${item.id}-value`} />
    </View>
  );
}
