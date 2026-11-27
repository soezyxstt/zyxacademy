import Fixture from "./Fixture";
export default async function Page({ searchParams }: { searchParams: Promise<{ case?: string; theme?: string }> }) {
  return <Fixture params={await searchParams} />;
}
