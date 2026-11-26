import { Redirect, useLocalSearchParams } from "expo-router";

export default function SharedUiFixtureLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: "/internal/shared-ui/[caseId]", params: { caseId: id } }} />;
}
