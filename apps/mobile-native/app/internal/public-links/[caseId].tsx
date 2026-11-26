import { Redirect, useLocalSearchParams } from "expo-router";
import { getDirectoryCase } from "../../../../../packages/public-links/fixtures";
import { PublicDirectory } from "../../../features/public-links/directory";

export default function PublicDirectoryFixture() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const item = getDirectoryCase(caseId);
  if (!item) return <Redirect href="/" />;
  return <PublicDirectory state={{ status: "ready", links: item.links }} locale={item.locale} theme={item.theme} retry={() => {}} />;
}
