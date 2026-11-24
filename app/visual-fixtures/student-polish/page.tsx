import { notFound } from "next/navigation";
import { StudentPolishFixture } from "./student-polish-fixture";

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  return <StudentPolishFixture view={(await searchParams).view ?? "quiz"} />;
}
