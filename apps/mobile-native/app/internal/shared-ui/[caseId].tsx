import { Redirect, useLocalSearchParams } from "expo-router";
import { sharedUiCases } from "../../../../../packages/native-parity/shared-ui/cases";
import { SharedUiCase } from "../../../features/shared-ui/SharedUiCase";

export default function InternalSharedUiFixture() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const fixture = sharedUiCases.find(item => item.id === caseId);
  if (!fixture) return <Redirect href="/" />;
  return <SharedUiCase id={fixture.id} />;
}
