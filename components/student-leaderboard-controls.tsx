"use client";

import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type LeaderboardTab = "rank" | "academic";

type Props = {
  tab: LeaderboardTab;
  period: "week" | "month" | "all";
  scope: "global" | "following";
  courseId?: string;
  courses: { id: string; title: string }[];
  locale: string;
  children: ReactNode;
  courseParam?: string;
  legacyAcademicParam?: string;
};

export function StudentLeaderboardControls({ tab, period, scope, courseId, courses, locale, children, courseParam = "course", legacyAcademicParam }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const en = locale === "en";
  const filterLabel = en ? "Filters" : "Filter";
  const activeFilter = tab === "rank" ? period !== "all" || scope !== "global" : Boolean(courseId);

  function navigate(key: string, value: string | null) {
    const url = new URL(window.location.href);
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
    url.searchParams.delete("cursor");
    if (key === "tab" && legacyAcademicParam) url.searchParams.delete(legacyAcademicParam);
    router.push(`${url.pathname}${url.search}`, { scroll: false });
  }

  return (
    <Tabs value={tab} onValueChange={(value) => {
      setOpen(false);
      navigate("tab", value === "rank" ? null : value);
    }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList aria-label={en ? "Leaderboard type" : "Jenis peringkat"}>
          <TabsTrigger value="rank">Rank</TabsTrigger>
          <TabsTrigger value="academic">{en ? "Academic" : "Akademik"}</TabsTrigger>
        </TabsList>
        <Popover open={open} onOpenChange={setOpen}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="icon-lg" aria-label={activeFilter ? (en ? "Filters, active" : "Filter, aktif") : filterLabel}>
                    <SlidersHorizontal className="size-4" />
                    {activeFilter && <span aria-hidden="true" className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" />}
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>{filterLabel}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <PopoverContent align="end" className="w-72 max-w-[calc(100vw-2rem)] space-y-4">
            {tab === "rank" ? <>
              <div className="space-y-2">
                <Label htmlFor="leaderboard-period">{en ? "Period" : "Periode"}</Label>
                <Select value={period} onValueChange={(value) => navigate("period", value === "all" ? null : value)}>
                  <SelectTrigger id="leaderboard-period"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">{en ? "Week" : "Minggu"}</SelectItem>
                    <SelectItem value="month">{en ? "Month" : "Bulan"}</SelectItem>
                    <SelectItem value="all">{en ? "All time" : "Semua waktu"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="leaderboard-scope">{en ? "Scope" : "Cakupan"}</Label>
                <Select value={scope} onValueChange={(value) => navigate("scope", value === "global" ? null : value)}>
                  <SelectTrigger id="leaderboard-scope"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global</SelectItem>
                    <SelectItem value="following">{en ? "Following" : "Diikuti"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </> : <div className="space-y-2">
              <Label htmlFor="leaderboard-course">{en ? "Course" : "Kelas"}</Label>
              <Select value={courseId ? `course:${courseId}` : "all"} onValueChange={(value) => navigate(courseParam, value === "all" ? null : value.slice(7))}>
                <SelectTrigger id="leaderboard-course"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{en ? "All courses" : "Semua kelas"}</SelectItem>
                  {courses.map((course) => <SelectItem key={course.id} value={`course:${course.id}`}>{course.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>}
          </PopoverContent>
        </Popover>
      </div>
      <TabsContent value={tab}>{children}</TabsContent>
    </Tabs>
  );
}
