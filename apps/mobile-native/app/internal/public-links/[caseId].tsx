import { Redirect, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { directoryCases, directoryFrame, getDirectoryCase } from "../../../../../packages/public-links/fixtures";
import { PublicDirectory } from "../../../features/public-links/directory";

export default function PublicDirectoryFixture() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const item = getDirectoryCase(caseId);
  if (!item) return <Redirect href="/" />;
  const index = Object.keys(directoryCases).indexOf(caseId);
  return <SafeAreaView style={{ flex: 1, alignItems: "flex-start" }}>
    <View accessible={false} style={{ width: directoryFrame.width - index, height: 1, backgroundColor: "#e000ef" }} />
    <View style={directoryFrame}>
      <PublicDirectory insideSafeArea state={{ status: "ready", links: item.links }} locale={item.locale} theme={item.theme} retry={() => {}} />
    </View>
    <View accessible={false} style={{ width: directoryFrame.width - index, height: 1, backgroundColor: "#e000ef" }} />
  </SafeAreaView>;
}
