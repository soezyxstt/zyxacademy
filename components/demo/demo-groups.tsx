"use client";
import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useDemoCommunity } from "./use-demo-community";
import { demoCommunitySchema } from "@/lib/demo/community-state";
import { demoIdentity, demoOwnIdentity } from "@/lib/demo/gamification";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useDemoGamification } from "./demo-gamification-provider";
import { StudentIdentity } from "@/components/gamification/student-identity";
import { useAppLocale } from "@/lib/i18n/client";

export function DemoGroups() {
  const { state, ready, error, save } = useDemoCommunity();
  const { locale } = useAppLocale();
  const experience = useStudentExperience();
  const { state: gamification } = useDemoGamification();
  const ownName = experience.account?.name ?? "Pelajar Demo";
  const [name, setName] = useState("");
  const [members, setMembers] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { setName(state.group.name); setMembers(state.group.members.join("\n")); }, [state.group]);
  return <ApplicationPage><PageHeader icon={Users} title="Kelompok belajar" />
    <section className="mb-6 max-w-xl space-y-3"><h2 className="font-heading text-body-base font-bold">{state.group.name}</h2><div className="divide-y rounded-xl border bg-card">{state.group.members.map(member => <div key={member} className="px-4 py-3"><StudentIdentity name={member} identity={member === ownName ? demoOwnIdentity(ownName, gamification.equipped) : demoIdentity(member)} /></div>)}</div><h2 className="font-heading text-body-base font-bold">{locale === "en" ? "Edit group" : "Ubah kelompok"}</h2></section>
    <form className="max-w-xl space-y-4" aria-busy={!ready} onSubmit={event => {
      event.preventDefault(); setMessage("");
      const group = { name: name.trim(), members: members.split("\n").map(row => row.trim()).filter(Boolean) };
      if (!demoCommunitySchema.safeParse({ ...state, group }).success) { setMessage("Gunakan nama kelompok dan 1 sampai 6 anggota dengan nama berbeda."); return; }
      try { save(current => ({ ...current, group })); setMessage("Kelompok tersimpan."); }
      catch { /* The storage error is rendered below; keep the draft. */ }
    }}><fieldset disabled={!ready} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="demo-group-name">Nama kelompok</Label><Input id="demo-group-name" value={name} maxLength={200} onChange={event => setName(event.target.value)} required /></div>
      <div className="space-y-2"><Label htmlFor="demo-group-members">Anggota, satu nama per baris</Label><Textarea id="demo-group-members" value={members} onChange={event => setMembers(event.target.value)} required /></div>
      <Button type="submit">Simpan kelompok</Button>
    </fieldset>{error ? <p role="alert" className="text-body-xs text-destructive">{error}</p> : null}{message ? <p role="status" className="text-body-xs">{message}</p> : null}</form>
  </ApplicationPage>;
}
