"use client";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function AchievementTabs({ active, labels }: { active: string; labels: Record<string, string> }) {
  const router = useRouter();
  return <Tabs value={active} onValueChange={(tab) => router.push(tab === "overview" ? "/achievements" : `/achievements?tab=${tab}`, { scroll: false })}>
    <TabsList>{Object.entries(labels).map(([key, label]) => <TabsTrigger key={key} value={key}>{label}</TabsTrigger>)}</TabsList>
  </Tabs>;
}
