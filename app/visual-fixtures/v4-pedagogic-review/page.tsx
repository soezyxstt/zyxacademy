import { notFound } from "next/navigation";
import { PedagogicReviewFixture } from "./visual-fixture";
export default async function PedagogicReviewPage({ searchParams }: { searchParams: Promise<{ verified?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { verified } = await searchParams;
  return <PedagogicReviewFixture verified={verified !== "0"} />;
}
