import { notFound } from "next/navigation";
import { CoursePolishFixture } from "../course-polish-fixture";

export default async function Page({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { section } = await searchParams;
  if (!section) notFound();
  const activityTimestamp = new Date(Date.now() - 90 * 60 * 1000).toISOString();
  return <CoursePolishFixture section={section} activityTimestamp={activityTimestamp} />;
}
