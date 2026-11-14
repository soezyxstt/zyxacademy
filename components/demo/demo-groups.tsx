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

export function DemoGroups() {
  const { state, ready, error, save } = useDemoCommunity();
  const [name, setName] = useState("");
  const [members, setMembers] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { setName(state.group.name); setMembers(state.group.members.join("\n")); }, [state.group]);
  return <ApplicationPage><PageHeader icon={Users} title="Kelompok belajar" />
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
