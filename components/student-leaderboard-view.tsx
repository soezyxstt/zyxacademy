import type { ReactNode } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";

export function StudentLeaderboardView({ title, courseRankings, courseRankingsHref, children }: { title: string; courseRankings: string; courseRankingsHref: string; children: ReactNode }) {
 return <ApplicationPage><PageHeader title={title} icon={Trophy} actions={<Link className="text-body-sm text-primary underline" href={courseRankingsHref}>{courseRankings}</Link>} />{children}</ApplicationPage>;
}
