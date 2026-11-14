"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DemoCourseSummary } from "@/app/(marketing)/demo/demo-data";
import { DemoAuthCta } from "./demo-shell";
import { DemoSchedule } from "./demo-schedule";
import { useDemoState } from "./use-demo-state";
import { demoStateSchema } from "@/lib/demo-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const demoMembers = [
  { name: "Alya", score: 96 },
  { name: "Bima", score: 92 },
  { name: "Citra", score: 88 },
  { name: "Dimas", score: 84 },
  { name: "Nadia", score: 80 },
] as const;

export type DemoCommunityView = "schedule" | "leaderboard" | "groups";

export function DemoCommunity({ view, course, nextPath }: {
  view: DemoCommunityView;
  course: DemoCourseSummary;
  nextPath: string;
}) {
  const { state, save, ready, error } = useDemoState(nextPath);
  const [message, setMessage] = useState("");
  const score = state.quiz?.score;
  const count = state.quiz?.questionCount ?? 0;
  const ranked = [...demoMembers, ...(score != null && count > 0 ? [{ name: "Kamu", score: Math.round(score / count * 100) }] : [])].sort((a, b) => b.score - a.score);
  const titles = { schedule: "Jadwal belajar", leaderboard: "Leaderboard", groups: "Kelompok belajar" };
  return (
    <Card variant="solid" className="p-5 sm:p-6" aria-busy={!ready}>
      <h2 className="font-heading text-body-base font-bold">{titles[view]}</h2>
      <p className="mt-1 text-body-xs text-muted-foreground">{course.title}</p>

      {view === "schedule" && <DemoSchedule coursePath={nextPath} chapter={course.chapterTitle} />}

      {view === "leaderboard" && (
        <Table className="mt-5">
          <caption className="pb-3 text-left text-body-xs text-muted-foreground">Nilai kuis, skala 0 sampai 100</caption>
          <TableHeader><TableRow>
            <TableHead>Peringkat</TableHead><TableHead>Nama</TableHead><TableHead className="text-right">Nilai</TableHead>
          </TableRow></TableHeader>
          <TableBody>{ranked.map((member, index) => (
            <TableRow key={member.name}>
              <TableCell>{index + 1}</TableCell><TableCell>{member.name}</TableCell><TableCell className="text-right tabular-nums">{member.score}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      )}
      {view === "leaderboard" && error && <p role="alert" className="mt-3 text-body-sm text-status-error">{error}</p>}

      {view === "groups" && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-2">
            <Users className="size-5 text-muted-foreground" aria-hidden="true" />
            <h3 className="min-w-0 break-all font-heading text-body-sm font-bold">{state.groupName}</h3>
            <Badge variant="outline">Aktif</Badge>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4 border-b border-border pb-4 text-body-sm">
            <div><dt className="text-body-xs text-muted-foreground">Anggota</dt><dd className="mt-1">{state.members.length} dari 6 orang</dd></div>
            <div><dt className="text-body-xs text-muted-foreground">Sesi terpakai</dt><dd className="mt-1">{Object.values(state.sessions).filter(session => session.status === "completed").length} sesi selesai</dd></div>
          </dl>
          <ul className="divide-y divide-border">
            {state.members.map((name, index) => (
              <li key={name} className="flex items-center justify-between gap-3 py-3 text-body-sm">
                <span className="min-w-0 flex-1 break-words">{name}</span><span className="shrink-0 text-body-xs text-muted-foreground">{index === 0 ? "Ketua" : "Anggota"}</span>
              </li>
            ))}
          </ul>
          <form className="mt-5 space-y-3 border-t border-border pt-4" key={state.groupName + state.members.join(",")} onSubmit={event => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const groupName = String(form.get("name") ?? "");
            const members = String(form.get("members") ?? "").split("\n").map(name => name.trim()).filter(Boolean);
            if (!demoStateSchema.shape.groupName.safeParse(groupName).success || !demoStateSchema.shape.members.safeParse(members).success) {
              setMessage("Isi nama kelompok dan 1 sampai 6 anggota dengan nama berbeda."); return;
            }
            if (save(current => ({ ...current, groupName, members }))) setMessage("Kelompok tersimpan di browser.");
          }}>
            <fieldset disabled={!ready} className="min-w-0 space-y-3">
            <div className="space-y-2"><Label htmlFor="demo-group-name">Nama kelompok</Label><Input id="demo-group-name" name="name" defaultValue={state.groupName} required maxLength={200} /></div>
            <div className="space-y-2"><Label htmlFor="demo-members">Anggota, satu nama per baris</Label><Textarea id="demo-members" name="members" defaultValue={state.members.join("\n")} required /></div>
            <Button type="submit" disabled={!ready}>Simpan kelompok</Button>
            {(error || message) && <p role="status" className="text-body-sm">{error || message}</p>}
            </fieldset>
          </form>
        </div>
      )}

      <div className="mt-6"><DemoAuthCta nextPath={nextPath} /></div>
    </Card>
  );
}
