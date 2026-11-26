import { Redirect, useLocalSearchParams } from "expo-router";
import { layoutCases } from "../../../../../packages/native-parity/shared-ui/layout-cases";
import { FirstSliceExample } from "../../../features/shared-ui";

export default function InternalSharedUiFixture() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const fixture = layoutCases.find(item => item.id === caseId);
  if (!fixture) return <Redirect href="/" />;
  return <FirstSliceExample caseId={fixture.id} />;
}
