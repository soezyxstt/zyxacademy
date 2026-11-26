import { Redirect, useLocalSearchParams } from "expo-router";
import { directoryCases, directoryFrame, getDirectoryCase } from "../../../../../packages/public-links/fixtures";
import { MarkedPageFrame } from "../../../features/parity/MarkedPageFrame";
import { PublicDirectory } from "../../../features/public-links/directory";

export default function PublicDirectoryFixture() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const item = getDirectoryCase(caseId);
  if (!item) return <Redirect href="/" />;
  const index = Object.keys(directoryCases).indexOf(caseId);
  return <MarkedPageFrame frame={directoryFrame} index={index}>
    <PublicDirectory insideSafeArea state={{ status: "ready", links: item.links }} locale={item.locale} theme={item.theme} retry={() => {}} />
  </MarkedPageFrame>;
}
