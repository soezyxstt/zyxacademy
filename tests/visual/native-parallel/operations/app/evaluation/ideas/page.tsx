import { IdeaAssignmentFixture } from "./reference-client";

export default async function IdeaAssignmentPage({ searchParams }: { searchParams: Promise<{ theme?: string }> }) {
  const { theme } = await searchParams;
  return <main className={`${theme === "dark" ? "dark" : "light"} min-h-screen bg-background p-4 text-foreground`}>
    <IdeaAssignmentFixture />
  </main>;
}
