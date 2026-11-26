import { useState } from "react";
import { View } from "react-native";
import {
  ManagementFailure, articleCategories, articleTitle, emptyArticle, validateArticle,
  type Article, type ArticleFields,
} from "../../../../../packages/native-parity/operations/management-contract";
import { Action, Choices, Confirm, Copy, Feedback, Field, Heading, Item, LoadState, Screen, Section, Sections, styles, useAction, useDraft, useManagement, useRead, type Confirmation } from "./ui";

const articleStatuses: readonly (readonly [ArticleFields["status"], string])[] = [["draft", "Draf"], ["published", "Terbit"], ["scheduled", "Terjadwal (akan datang)"]];
const categories = Object.entries(articleCategories) as [ArticleFields["category"], string][];

export function BlogList() {
  const { navigate, share } = useManagement();
  const read = useRead("articles", undefined);
  return <Screen title="Blog" actions={<Action variant="default" onPress={() => navigate("/admin/blog/new")}>Tulis artikel</Action>}>
    <LoadState {...read} retry={read.reload} />
    {read.data && <Section>
      {!read.data.length && <Copy muted>Belum ada artikel. Mulai tulis artikel pertamamu.</Copy>}
      {read.data.map(article => <Item key={article.id} title={article.title} meta={`${articleCategories[article.category]} · ${articleStatuses.find(([status]) => status === article.status)?.[1]} · ${article.author}`}
        onPress={() => navigate(`/admin/blog/${encodeURIComponent(article.id)}/edit`)} actions={<>
          <Action onPress={() => navigate(`/blog/${encodeURIComponent(article.slug)}`)}>Lihat</Action>
          {share && <Action onPress={() => share(`/blog/${encodeURIComponent(article.slug)}`)}>Bagikan</Action>}
        </>} />)}
    </Section>}
  </Screen>;
}

export function BlogEditorRoute({ id }: { id?: string }) {
  const { navigate } = useManagement();
  const read = useRead("article", id ?? "", Boolean(id));
  if (!id || read.data) return <BlogEditor article={read.data} />;
  return <Screen title="Sunting" back={{ label: "Blog", run: () => navigate("/admin/blog") }}><LoadState {...read} retry={read.reload} /></Screen>;
}

function BlogEditor({ article }: { article?: Article }) {
  const { client, navigate, renderMarkdown } = useManagement();
  const { id, revision, slug: _slug, author: _author, ...fields } = article ?? { ...emptyArticle, id: undefined, revision: undefined, slug: undefined, author: undefined };
  const draft = useDraft<ArticleFields>(`blog:${id ?? "new"}`, fields, revision);
  const value = draft.value;
  const action = useAction();
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [tag, setTag] = useState("");
  const [media, setMedia] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaCaption, setMediaCaption] = useState("");
  const [mediaSource, setMediaSource] = useState("");
  const [mediaSourceUrl, setMediaSourceUrl] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [latest, setLatest] = useState<Article | null>(null);
  const [checking, setChecking] = useState(false);
  const edit = <K extends keyof ArticleFields>(key: K, next: ArticleFields[K]) => draft.change({ ...value, [key]: next });
  const leave = () => navigate("/admin/blog");

  function submit() {
    const error = validateArticle(value);
    if (error) return action.setError(new ManagementFailure("invalid", error));
    const save = () => action.run({ type: "article.save", id, revision: draft.revision, fields: value }, () => { draft.clear(); leave(); });
    if (value.status === "published") setConfirmation({ title: "Terbitkan artikel?", description: `Artikel ${articleTitle(value)} akan tampil di blog.`, label: "Terbitkan", run: save });
    else void save();
  }

  function insertMedia() {
    if (!/^https:\/\/[^\s"<>]+$/.test(mediaUrl) || (mediaSourceUrl && !/^https:\/\/[^\s"<>]+$/.test(mediaSourceUrl))) return action.setError(new ManagementFailure("invalid", "Gunakan tautan media HTTPS yang valid."));
    const attribute = (name: string, data: string) => data ? ` ${name}="${data.replace(/["\n\r]/g, "")}"` : "";
    edit("content", `${value.content}\n\n:::media {src="${mediaUrl}"${attribute("caption", mediaCaption)}${attribute("sourceLabel", mediaSource)}${attribute("sourceUrl", mediaSourceUrl)}}\n:::\n`);
    setMedia(false);
    setMediaUrl("");
    setMediaCaption("");
    setMediaSource("");
    setMediaSourceUrl("");
    action.setError(undefined);
  }

  async function inspectLatest() {
    if (!id || checking) return;
    setChecking(true);
    try { setLatest(await client.read("article", id)); }
    catch (error) { action.setError(error); }
    finally { setChecking(false); }
  }

  return <Screen title={article ? "Sunting" : "Tulis artikel"} description={article?.title} back={{ label: "Blog", run: leave }}>
    <View style={styles.row}>
      <Action onPress={leave} disabled={action.busy}>Batal</Action>
      <Action variant="default" onPress={submit} busy={action.busy}>Simpan artikel</Action>
    </View>
    <Feedback {...action} />
    {action.error instanceof ManagementFailure && action.error.code === "conflict" && <Action onPress={inspectLatest} busy={checking}>Muat revisi terbaru</Action>}
    {latest && <Section title="Revisi tersimpan">
      <Copy strong>{latest.title}</Copy><Copy muted>{latest.summary}</Copy><Copy>{latest.content}</Copy>
      <Action onPress={() => { draft.reviewRevision(latest.revision); setLatest(null); action.setError(undefined); }}>Lanjutkan dengan perubahan lokal</Action>
    </Section>}
    <Field label="Judul artikel (opsional)" value={value.title} placeholder="Judul dapat diambil dari heading pertama" onChangeText={next => edit("title", next)} />
    <Field label="Ringkasan / Summary (opsional)" value={value.summary} multiline onChangeText={next => edit("summary", next)} />
    <Heading>Konten (Markdown)</Heading>
    <Sections current={mode} values={[["write", "Tulis"], ["preview", "Pratinjau"]]} onChange={setMode} />
    {mode === "write" ? <>
      <Field label="Konten (Markdown)" value={value.content} multiline style={{ minHeight: 180 }} onChangeText={next => edit("content", next)} />
      <View style={styles.row}><Action onPress={() => setMedia(!media)}>{media ? "Tutup media" : "Sisipkan media"}</Action></View>
      {media && <Section title="Sisipkan media">
        <Field label="URL media" value={mediaUrl} onChangeText={setMediaUrl} autoCapitalize="none" keyboardType="url" />
        <Field label="Keterangan media" value={mediaCaption} onChangeText={setMediaCaption} />
        <Field label="Nama sumber" value={mediaSource} onChangeText={setMediaSource} />
        <Field label="URL sumber" value={mediaSourceUrl} onChangeText={setMediaSourceUrl} autoCapitalize="none" keyboardType="url" />
        <Action onPress={insertMedia}>Sisipkan media</Action>
      </Section>}
    </> : <Section>
      <Heading>{articleTitle(value) || "Judul artikel"}</Heading>
      {value.summary && <Copy muted>{value.summary}</Copy>}
      {value.content ? renderMarkdown?.(value.content) ?? <Copy>{value.content}</Copy> : <Copy muted>Konten masih kosong.</Copy>}
    </Section>}
    <Section title="Pengaturan publikasi">
      <Copy strong>Status</Copy><Choices values={articleStatuses} current={value.status} onChange={next => edit("status", next)} />
      <Copy strong>Kategori</Copy><Choices values={categories} current={value.category} onChange={next => edit("category", next)} />
      <Field label="Thumbnail utama" value={value.thumbnailUrl} autoCapitalize="none" keyboardType="url" onChangeText={next => edit("thumbnailUrl", next)} />
      <Field label="Tag (tekan Enter)" value={tag} onChangeText={setTag} onSubmitEditing={() => {
        const next = tag.trim();
        if (next && !value.tags.includes(next)) edit("tags", [...value.tags, next]);
        setTag("");
      }} />
      {value.tags.length > 0 && <View style={styles.row}>{value.tags.map(entry => <Action key={entry} onPress={() => edit("tags", value.tags.filter(item => item !== entry))}>{`Hapus ${entry}`}</Action>)}</View>}
    </Section>
    <Confirm value={confirmation} onClose={() => setConfirmation(null)} />
  </Screen>;
}
