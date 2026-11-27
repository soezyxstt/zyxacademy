import { useState } from "react";
import { Linking, View } from "react-native";
import type { CourseFixture, CoursePlaylist, CourseVideo, Flashcard, FlashcardSet } from "../../../../../packages/native-parity/academic/courses/fixtures";
import type { AcademicActor } from "../contracts";
import { DeleteRecord } from "./overview";
import { MutationStatus, useCourseMutation } from "./scope";
import { Action, CourseDialog, CourseStatus, DataRow, Field, Ink, Panel, Picker, SearchBox, layout } from "./ui";

type EditField = { name: string; label: string; value: string; multiline?: boolean; choices?: readonly { id: string; label: string }[] };
type EditMedia = {
  title: string;
  fields: readonly EditField[];
  apply(current: CourseFixture, changes: Record<string, string>, id: string): CourseFixture | string;
};

function MediaEditor({ actor, data, edit, close }: { actor: AcademicActor; data: CourseFixture; edit: EditMedia; close(): void }) {
  const [revision] = useState(data.revision);
  const [values, setValues] = useState(() => Object.fromEntries(edit.fields.map((field) => [field.name, field.value])));
  const mutation = useCourseMutation(actor, close);
  const change = (name: string) => (value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    mutation.clear();
  };
  const save = () => mutation.submit({
    slug: data.course.slug, operation: "update", revision,
    apply(current, id) {
      if (!current) return "Mata kuliah tidak ditemukan.";
      return edit.apply(current, Object.fromEntries(Object.entries(values).map(([name, value]) => [name, value.trim()])), id);
    },
  });

  return (
    <CourseDialog title={edit.title} onClose={close}>
      {edit.fields.map((field) => field.choices ? (
        <Picker key={field.name} label={field.label} selected={values[field.name]} onSelect={change(field.name)} options={field.choices} />
      ) : (
        <Field key={field.name} label={field.label} value={values[field.name]} onChangeText={change(field.name)}
          multiline={field.multiline} autoCapitalize={field.name === "url" ? "none" : undefined} autoCorrect={field.name !== "url"} />
      ))}
      <MutationStatus mutation={mutation} reload={close} />
      <Action label="Simpan" onPress={save} variation="default" disabled={mutation.result?.status === "retry" || mutation.result?.status === "conflict"} />
    </CourseDialog>
  );
}

type DeleteMedia = { title: string; impact: string; apply(current: CourseFixture): CourseFixture | string };

export function CourseVideos({ data, actor }: { data: CourseFixture; actor: AcademicActor }) {
  const [editing, setEditing] = useState<EditMedia | null>(null);
  const [deleting, setDeleting] = useState<DeleteMedia | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<CourseVideo | null>(null);
  const [playError, setPlayError] = useState(false);
  const term = search.trim().toLocaleLowerCase("id");
  const playlists = data.playlists.filter((item) => item.title.toLocaleLowerCase("id").includes(term) ||
    item.videos.some((video) => video.title.toLocaleLowerCase("id").includes(term)));

  function editPlaylist(playlist?: CoursePlaylist) {
    setEditing({
      title: playlist ? "Edit daftar putar" : "Tambah daftar putar",
      fields: [{ name: "title", label: "Judul daftar putar", value: playlist?.title ?? "" }],
      apply(current, { title }, id) {
        if (!title) return "Judul daftar putar wajib diisi.";
        const next = { id: playlist?.id ?? id, title, videos: playlist?.videos ?? [] };
        return { ...current, playlists: playlist ? current.playlists.map((item) => item.id === playlist.id ? next : item) : [...current.playlists, next] };
      },
    });
  }

  function editVideo(playlist: CoursePlaylist, video?: CourseVideo) {
    setEditing({
      title: video ? "Edit video" : "Tambah video",
      fields: [
        { name: "title", label: "Judul video", value: video?.title ?? "" },
        { name: "url", label: "Tautan video HTTPS", value: video?.url ?? "" },
      ],
      apply(current, { title, url }, id) {
        if (!title) return "Judul video wajib diisi.";
        try {
          if (new URL(url).protocol !== "https:") return "Gunakan tautan HTTPS.";
        } catch {
          return "Masukkan tautan video yang valid.";
        }
        const next = { id: video?.id ?? id, title, url, duration: video?.duration ?? "" };
        return { ...current, playlists: current.playlists.map((item) => item.id === playlist.id ? {
          ...item, videos: video ? item.videos.map((entry) => entry.id === video.id ? next : entry) : [...item.videos, next],
        } : item) };
      },
    });
  }

  return (
    <>
      <SearchBox label="Cari video atau daftar putar" value={search} onChange={setSearch} />
      <Panel title="Daftar putar" action={<Action label="Tambah" onPress={() => editPlaylist()} />}>
        {playlists.length ? playlists.map((playlist) => (
          <View key={playlist.id} style={layout.compact}>
            <DataRow title={playlist.title} detail={`${playlist.videos.length} video`}
              onPress={() => setExpanded(playlist.id === expanded ? null : playlist.id)} expanded={playlist.id === expanded} />
            {playlist.id === expanded ? (
              <>
                <View style={layout.row}>
                  <Action label="Tambah video" onPress={() => editVideo(playlist)} />
                  <Action label="Edit daftar" onPress={() => editPlaylist(playlist)} variation="ghost" />
                  <Action label="Hapus daftar" onPress={() => setDeleting({
                    title: playlist.title, impact: `${playlist.videos.length} video dalam daftar akan dihapus.`,
                    apply: (current) => ({ ...current, playlists: current.playlists.filter((item) => item.id !== playlist.id) }),
                  })} variation="ghost" />
                </View>
                {playlist.videos.map((video) => (
                  <View style={layout.group} key={video.id}>
                    <DataRow title={video.title} detail={video.duration} onPress={() => { setPlayError(false); setPreview(video); }} />
                    <View style={layout.row}>
                      <Action label="Edit video" onPress={() => editVideo(playlist, video)} variation="ghost" />
                      <Action label="Hapus video" onPress={() => setDeleting({
                        title: video.title, impact: "Video akan dihapus dari daftar putar.",
                        apply: (current) => ({ ...current, playlists: current.playlists.map((item) => item.id === playlist.id ? {
                          ...item, videos: item.videos.filter((entry) => entry.id !== video.id),
                        } : item) }),
                      })} variation="ghost" />
                    </View>
                  </View>
                ))}
              </>
            ) : null}
          </View>
        )) : <CourseStatus label={term ? "Tidak ada video yang sesuai." : "Belum ada daftar putar."} />}
      </Panel>
      {preview ? (
        <CourseDialog title={preview.title} onClose={() => setPreview(null)}>
          {preview.duration ? <Ink kind="meta" tone="muted">{preview.duration}</Ink> : null}
          {playError ? <CourseStatus label="Tautan video tidak dapat dibuka." error /> : null}
          <Action label="Buka video" onPress={() => { setPlayError(false); void Linking.openURL(preview.url).catch(() => setPlayError(true)); }} />
        </CourseDialog>
      ) : null}
      {editing ? <MediaEditor data={data} actor={actor} edit={editing} close={() => setEditing(null)} /> : null}
      {deleting ? <DeleteRecord data={data} actor={actor} {...deleting} close={() => setDeleting(null)} /> : null}
    </>
  );
}

export function CourseFlashcards({ data, actor }: { data: CourseFixture; actor: AcademicActor }) {
  const [editing, setEditing] = useState<EditMedia | null>(null);
  const [deleting, setDeleting] = useState<DeleteMedia | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [flippedCard, setFlippedCard] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [chapter, setChapter] = useState("");
  const term = search.trim().toLocaleLowerCase("id");
  const chapters = data.chapters.map(({ id, title }) => ({ id, label: title }));
  const sets = data.flashcards.filter((set) => (!chapter || set.chapterId === chapter) && set.title.toLocaleLowerCase("id").includes(term));

  function editSet(set?: FlashcardSet) {
    setEditing({
      title: set ? "Edit set kartu" : "Tambah set kartu",
      fields: [
        { name: "title", label: "Judul set", value: set?.title ?? "" },
        { name: "chapterId", label: "Bab", value: set?.chapterId ?? "", choices: chapters },
        { name: "status", label: "Status set", value: set?.status ?? "draft", choices: [{ id: "draft", label: "Draf" }, { id: "published", label: "Terbit" }] },
      ],
      apply(current, values, id) {
        if (!values.title) return "Judul set kartu wajib diisi.";
        if (!current.chapters.some((item) => item.id === values.chapterId)) return "Pilih bab untuk set kartu.";
        const status = values.status === "published" ? "published" : "draft";
        if (status === "published" && !set?.cards.length) return "Tambahkan kartu sebelum menerbitkan set ini.";
        const next = { id: set?.id ?? id, title: values.title, chapterId: values.chapterId, status, cards: set?.cards ?? [] } satisfies FlashcardSet;
        return { ...current, flashcards: set ? current.flashcards.map((item) => item.id === set.id ? next : item) : [...current.flashcards, next] };
      },
    });
  }

  function editCard(set: FlashcardSet, card?: Flashcard) {
    setEditing({
      title: card ? "Edit kartu" : "Tambah kartu",
      fields: [
        { name: "front", label: "Sisi depan", value: card?.front ?? "", multiline: true },
        { name: "back", label: "Sisi belakang", value: card?.back ?? "", multiline: true },
      ],
      apply(current, { front, back }, id) {
        if (!front || !back) return "Isi kedua sisi kartu.";
        const next = { id: card?.id ?? id, front, back };
        return { ...current, flashcards: current.flashcards.map((item) => item.id === set.id ? {
          ...item, cards: card ? item.cards.map((entry) => entry.id === card.id ? next : entry) : [...item.cards, next],
        } : item) };
      },
    });
  }

  return (
    <>
      <SearchBox label="Cari set kartu" value={search} onChange={setSearch} />
      {chapters.length ? <Picker label="Bab" options={[{ id: "", label: "Semua bab" }, ...chapters]} selected={chapter} onSelect={setChapter} /> : null}
      <Panel title="Set kartu" action={<Action label="Tambah set" onPress={() => editSet()} disabled={!chapters.length} />}>
        {!chapters.length ? <CourseStatus label="Buat bab sebelum menambah set kartu." /> : null}
        {sets.length ? sets.map((set) => (
          <View key={set.id} style={layout.group}>
            <DataRow title={set.title} description={`${chapters.find((item) => item.id === set.chapterId)?.label ?? "Tanpa bab"} · ${set.status === "published" ? "Terbit" : "Draf"}`}
              detail={`${set.cards.length} kartu`} onPress={() => setExpanded(set.id === expanded ? null : set.id)} expanded={set.id === expanded} />
            {expanded === set.id ? (
              <>
                <View style={layout.row}>
                  <Action label="Tambah kartu" onPress={() => editCard(set)} />
                  <Action label="Edit set" onPress={() => editSet(set)} variation="ghost" />
                  <Action label="Hapus set" onPress={() => setDeleting({
                    title: set.title, impact: `Set dan ${set.cards.length} kartu akan dihapus.`,
                    apply: (current) => ({ ...current, flashcards: current.flashcards.filter((item) => item.id !== set.id) }),
                  })} variation="ghost" />
                </View>
                {set.cards.map((card) => (
                  <View key={card.id} style={layout.compact}>
                    <DataRow title={card.front} description={flippedCard === card.id ? card.back : undefined}
                      onPress={() => setFlippedCard(flippedCard === card.id ? null : card.id)} expanded={flippedCard === card.id} />
                    {flippedCard === card.id ? (
                      <View style={layout.row}>
                        <Action label="Edit kartu" onPress={() => editCard(set, card)} variation="ghost" />
                        <Action label="Hapus kartu" onPress={() => setDeleting({
                          title: "kartu", impact: card.front,
                          apply: (current) => ({ ...current, flashcards: current.flashcards.map((item) => item.id === set.id ? {
                            ...item, cards: item.cards.filter((entry) => entry.id !== card.id),
                          } : item) }),
                        })} variation="ghost" />
                      </View>
                    ) : null}
                  </View>
                ))}
              </>
            ) : null}
          </View>
        )) : <CourseStatus label={term || chapter ? "Tidak ada set pada pilihan ini." : "Belum ada set kartu."} />}
      </Panel>
      {editing ? <MediaEditor data={data} actor={actor} edit={editing} close={() => setEditing(null)} /> : null}
      {deleting ? <DeleteRecord data={data} actor={actor} {...deleting} close={() => setDeleting(null)} /> : null}
    </>
  );
}
