import { Text, type TextProps } from "react-native";

import { resolveDateDisplay, type FormattedDateInput } from "../../../lib/date-utils/display";
import { useNativeUiLocale } from "../auth/use-account-context";

type FormattedDateProps = Omit<TextProps, "children"> & FormattedDateInput;

export function FormattedDate({ date, locale, options, ...props }: FormattedDateProps) {
  const appLocale = useNativeUiLocale();
  const formatted = resolveDateDisplay({ date, locale, options }, appLocale);
  return formatted ? <Text accessibilityLanguage={formatted.locale} {...props}>{formatted.text}</Text> : null;
}
