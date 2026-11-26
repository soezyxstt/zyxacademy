import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import type { DiscussionMention, DiscussionRole } from "../../../../../lib/discussions/contracts";
import type { TutorSupportClient } from "../../../../../packages/academic/tutor-support";
import type { TutorDiscussionProfile } from "../../../../../packages/academic/tutor-discussion-mentions";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { Label, Row, tutorLayout, type TutorTheme } from "./ui";

export const discussionRoleLabel: Record<DiscussionRole, string> = { student: "Peserta", tutor: "Tutor", admin: "Admin" };

type Scope = { service: TutorSupportClient; courseId?: string; threadId: string; theme: TutorTheme };

export function TutorDiscussionMentionPicker({ service, courseId, threadId, theme, select, close, channelId }: Omit<Scope, "threadId"> & {
  threadId?: string; channelId?: string;
  select(person?: DiscussionMention): void;
  close(): void;
}) {
  const { canInteract, suspended } = useProtectedInteraction();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ query: string; items?: DiscussionMention[]; failed?: boolean }>();
  const search = query.trim();
  const canSearch = Boolean(channelId ? service.discussionWorkspace?.channelMentions : threadId && service.discussionMentions);
  const matches = result?.query === search ? result : undefined;
  useEffect(() => {
    if (!canSearch || search.length < 2 || suspended) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (!canInteract()) return;
      const task = channelId ? service.discussionWorkspace?.channelMentions(courseId, channelId, search, controller.signal)
        : threadId ? service.discussionMentions?.(courseId, threadId, search, controller.signal) : undefined;
      void task?.then(items => {
        if (!controller.signal.aborted) setResult({ query: search, items });
      }).catch(() => { if (!controller.signal.aborted) setResult({ query: search, failed: true }); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [canInteract, canSearch, suspended, service, courseId, channelId, threadId, search, retry]);
  return <View style={tutorLayout.group}>
    <View style={tutorLayout.cluster}>
      <Button theme={theme} variant="outline" onPress={() => { if (canInteract()) select(); }} testID="tutor-discussion-mention-zyra">@Zyra</Button>
      <Button theme={theme} variant="outline" onPress={close}>Tutup pilihan</Button>
    </View>
    {canSearch ? <>
      <Input theme={theme} autoFocus accessibilityLabel="Cari peserta diskusi" placeholder="Cari nama peserta"
        testID="tutor-discussion-mention-search" autoCorrect={false} maxLength={80} value={query}
        onChangeText={value => { setQuery(value); setResult(undefined); setPage(1); }} />
      {search.length >= 2 && !matches ? <ActivityIndicator accessibilityLabel="Mencari peserta" /> : null}
      {matches?.failed ? <Button theme={theme} variant="outline" onPress={() => { setResult(undefined); setRetry(value => value + 1); }}>Ulangi pencarian</Button> : null}
      {matches?.items?.length === 0 ? <Label theme={theme} tone="muted">Peserta tidak ditemukan.</Label> : null}
      {matches?.items?.length ? <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 200 }}>
        {matches.items.slice(0, page * 12).map(person => <Row key={person.id} theme={theme} title={person.name}
          subtitle={[person.role ? discussionRoleLabel[person.role] : null, person.context].filter(Boolean).join(" · ")}
          meta={person.ambiguous ? "Identitas belum dapat dibedakan" : undefined}
          testID={`tutor-discussion-mention-${person.id}`}
          onPress={person.ambiguous ? undefined : () => { if (canInteract()) select(person); }} />)}
        {matches.items.length > page * 12 ? <Button theme={theme} variant="outline" onPress={() => setPage(value => value + 1)}>Lihat lainnya</Button> : null}
      </ScrollView> : null}
    </> : null}
  </View>;
}

export function TutorDiscussionPerson({ service, courseId, threadId, theme, personId, close }: Scope & {
  personId: string; close(): void;
}) {
  const { canInteract, suspended } = useProtectedInteraction();
  const [profile, setProfile] = useState<TutorDiscussionProfile>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!service.discussionProfile || suspended || !canInteract()) return;
    const controller = new AbortController();
    void service.discussionProfile(courseId, threadId, personId, controller.signal).then(value => {
      if (!controller.signal.aborted) setProfile(value);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [service, courseId, threadId, personId, suspended, canInteract]);
  return <View style={tutorLayout.group} accessibilityLiveRegion="polite">
    {profile ? <>
      <Label theme={theme} tone="strong">{profile.name}</Label>
      {profile.role ? <Label theme={theme}>{discussionRoleLabel[profile.role]}</Label> : null}
      {[profile.major, profile.faculty].filter(Boolean).length ? <Label theme={theme} tone="muted">{[profile.major, profile.faculty].filter(Boolean).join(" · ")}</Label> : null}
    </> : <Label theme={theme} tone={failed ? "error" : "muted"}>{failed ? "Profil tidak tersedia." : "Memuat profil…"}</Label>}
    <Button theme={theme} variant="outline" onPress={close}>Tutup profil</Button>
  </View>;
}
