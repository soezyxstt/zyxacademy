import { notFound } from "next/navigation";
import {
  MobileUiPreviewFixtureClient,
  type MobilePreviewView,
} from "./fixture-client";

export const dynamic = "force-dynamic";

const ALLOWED_VIEWS = new Set<MobilePreviewView>([
  "student-home",
  "student-course",
  "student-profile",
  "student-schedule",
  "tutor-home",
  "tutor-grading",
  "tutor-schedule",
  "article-reader",
  "article-toc",
  "zyra-drawer",
  "discussion-list",
  "discussion-thread",
  "admin-home",
  "admin-more",
  "sonner-toast",
]);

function resolveView(raw?: string): MobilePreviewView {
  if (raw && ALLOWED_VIEWS.has(raw as MobilePreviewView)) {
    return raw as MobilePreviewView;
  }
  return "student-home";
}

export default async function MobileUiPreviewVisualFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { view } = await searchParams;
  const resolvedView = resolveView(view);

  return <MobileUiPreviewFixtureClient view={resolvedView} />;
}
