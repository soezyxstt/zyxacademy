import { notFound } from "next/navigation";
import { CourseCatalogVisualFixture } from "./catalog-fixture";

export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { state } = await searchParams;
  return <CourseCatalogVisualFixture loading={state === "loading"} />;
}
