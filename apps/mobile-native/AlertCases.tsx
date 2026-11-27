import { useRouter, type Href } from "expo-router";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { alertPosition, type AlertCaseSpec } from "../../packages/ui-parity/alert-cases";
import { Alert } from "./components/Alert";

// Lucide icon geometry. See features/notification-inbox/LUCIDE-LICENSE.txt.
function AlertIcon({ name, color, size }: { name: NonNullable<AlertCaseSpec["icon"]>; color: string; size: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" accessible={false}>
    {name === "info" ? (
      <>
        <Circle cx={12} cy={12} r={10} />
        <Path d="M12 16v-4 M12 8h.01" />
      </>
    ) : <Path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46L12.06 9A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46L11.94 15A1 1 0 0 0 11 14z" />}
  </Svg>;
}

export function AlertCase({ item }: { item: AlertCaseSpec }) {
  const router = useRouter();
  const { icon, action } = item;
  return (
    <View style={alertPosition}>
      <Alert title={item.title} description={item.description} variant={item.variant} theme={item.theme}
        testID={item.id + "-alert"} icon={icon ? (color, size) => <AlertIcon name={icon} color={color} size={size} /> : undefined}
        action={action ? { label: action.label, onPress: () => router.navigate(action.href as Href) } : undefined} />
    </View>
  );
}
