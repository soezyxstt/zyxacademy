import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import {
  ManagementFailure, articleCategories, articleTitle, emptyArticle, validateArticle,
  type Article, type ArticleFields,
} from "../../../../../packages/native-parity/operations/management-contract";
import { articlePublicationIntent } from "../../../../../packages/native-parity/operations/management-revisions";
import { previewExternalHref, previewMedia } from "../../../../../packages/native-parity/operations/admin-markdown-media";
import type { BlogUploadPurpose } from "./blog-upload";
import { RevisionReview } from "./revisions";
import { Action, Choices, Confirm, Copy, Feedback, Field, Heading, Item, LoadState, Screen, Section, Sections, styles, useAction, useDraft, useManagement, useRead, type Confirmation } from "./ui";

const articleStatuses: readonly (readonly [ArticleFields["status"], string])[] = [["draft", "Draf"], ["published", "Terbit"], ["scheduled", "Terjadwal (akan datang)"]];
const categories = Object.entries(articleCategories) as [ArticleFields["category"], string][];

function articleFields(article: Article): ArticleFields {
  const { id: _id, revision: _revision, slug: _slug, author: _author, ...fields } = article;
  return fields;
}

export function BlogList() {
  const { navigate, share } = useManagement();
  const read = useRead("articles", undefined);
  return <Screen title="Blog" actions={<Action variant="default" onPress={() => navigate("/admin/blog/new")}>Tulis artikel</Action>}>
    <LoadState {...read} retry={read.reload} />
    {read.data && <Section>
      {!read.data.length && <Copy muted>Belum ada artikel. Mulai tulis artikel pertamamu.</Copy>}
      {read.data.map(article => <Item key={article.id} title={article.title} meta={`${articleCategories[article.category]} · ${articleStatuses.find(([status]) => status === article.status)?.[1]} · ${article.author}`}
        onPress={() => navigate(`/admin/blog/${encodeURIComponent(article.id)}/edit`)} actions={<>
          {article.status === "published" ? <>
            <Action onPress={() => navigate(`/blog/${encodeURIComponent(article.slug)}`)}>Lihat</Action>
            {share && <Action onPress={() => share(`/blog/${encodeURIComponent(article.slug)}`)}>Bagikan</Action>}
          </> : <Action onPress={() => navigate(`/admin/blog/${encodeURIComponent(article.id)}/edit?tab=preview`)}>Pratinjau</Action>}
        </>} />)}
    </Section>}
  </Screen>;
}

export function BlogEditorRoute({ id, tab }: { id?: string; tab?: string }) {
  const { navigate } = useManagement();
  const read = useRead("article", id ?? "", Boolean(id));
  if (!id || read.data) return <BlogEditor article={read.data} initialTab={tab} />;
  return <Screen title="Sunting" back={{ label: "Blog", run: () => navigate("/admin/blog") }}><LoadState {...read} retry={read.reload} /></Screen>;
}

function BlogEditor({ article, initialTab }: { article?: Article; initialTab?: string }) {
  const { client, navigate, renderMarkdown, pickBlogMedia, locale, origin } = useManagement();
  const id = article?.id;
  const draft = useDraft<ArticleFields>(`blog:${id ?? "new"}`, article ? articleFields(article) : emptyArticle, article?.revision);
  const value = draft.value;
  const action = useAction();
  const [mode, setMode] = useState<"write" | "preview">(initialTab === "preview" ? "preview" : "write");
  const [tag, setTag] = useState("");
  const [media, setMedia] = useState(false);
  const [mediaMode, setMediaMode] = useState<"file" | "youtube" | "link">("file");
  const [mediaUrls, setMediaUrls] = useState({ file: "", youtube: "", link: "" });
  const mediaUrl = mediaUrls[mediaMode];
  const [mediaCaption, setMediaCaption] = useState("");
  const [mediaSource, setMediaSource] = useState("");
  const [mediaSourceUrl, setMediaSourceUrl] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [needsReview, setNeedsReview] = useState(Boolean(article && article.revision !== draft.revision));
  const [latest, setLatest] = useState<Article | null>(() => needsReview ? article ?? null : null);
  const [checking, setChecking] = useState(false);
  const [uploading, setUploading] = useState<BlogUploadPurpose | null>(null);
  const [uploadError, setUploadError] = useState<{ purpose: BlogUploadPurpose; message: string }>();
  const uploadRequest = useRef<AbortController | null>(null);
  const selection = useRef<{ start: number; end: number } | null>(null);
  useEffect(() => () => uploadRequest.current?.abort(), []);
  const mustReview = needsReview || (action.error instanceof ManagementFailure && action.error.code === "conflict");
  const edit = <K extends keyof ArticleFields>(key: K, next: ArticleFields[K]) => { if (!action.busy) draft.update(fields => ({ ...fields, [key]: next })); };
  const leave = () => {
    uploadRequest.current?.abort();
    uploadRequest.current = null;
    setUploading(null);
    navigate("/admin/blog");
  };

  function submit() {
    if (mustReview || uploadRequest.current) return;
    const error = validateArticle(value);
    if (error) return action.setError(new ManagementFailure("invalid", error));
    const save = () => action.run({ type: "article.save", id, revision: draft.revision, fields: value }, () => { draft.clear(); leave(); });
    const intent = articlePublicationIntent(draft.baseline.status, value.status);
    if (intent === "publish") setConfirmation({ title: "Terbitkan artikel?", description: `Artikel ${articleTitle(value)} akan tampil di blog.`, label: "Terbitkan", run: save });
    else if (intent === "withdraw") setConfirmation({ title: "Tarik artikel dari blog?", description: `Artikel ${articleTitle(value)} akan disimpan sebagai draf.`, label: "Simpan draf", run: save });
    else void save();
  }

  function insertMedia() {
    if (action.busy || uploadRequest.current) return;
    const target = previewMedia(mediaUrl, origin, "blog");
    const source = mediaSourceUrl.trim();
    const safeSource = source ? previewExternalHref(source, origin) : "";
    if (!target || (mediaMode === "youtube" && target.kind !== "youtube") || (source && !safeSource)) {
      setUploadError({ purpose: "body", message: mediaMode === "youtube" ? "Periksa tautan YouTube dan tautan sumber." : "Periksa tautan media dan sumber, atau unggah berkas." });
      return;
    }
    const url = target.kind === "storage-image" ? target.path : target.kind === "image" ? target.uri : target.url;
    const attribute = (name: string, data: string) => data ? ` ${name}="${data.replace(/["\n\r]/g, "")}"` : "";
    const block = `\n\n:::media {${attribute("src", url).trim()}${attribute("caption", mediaCaption)}${attribute("sourceLabel", mediaSource)}${attribute("sourceUrl", safeSource ?? "")}}\n:::\n`;
    const { start, end } = selection.current ?? { start: value.content.length, end: value.content.length };
    edit("content", value.content.slice(0, start) + block + value.content.slice(end));
    const next = start + block.length;
    selection.current = { start: next, end: next };
    setMedia(false);
    setMediaUrls({ file: "", youtube: "", link: "" });
    setMediaCaption("");
    setMediaSource("");
    setMediaSourceUrl("");
    setUploadError(undefined);
  }

  async function inspectLatest() {
    if (!id || checking) return;
    setNeedsReview(true);
    setChecking(true);
    try { setLatest(await client.read("article", id)); }
    catch (error) { action.setError(error); }
    finally { setChecking(false); }
  }

  async function uploadMedia(purpose: BlogUploadPurpose) {
    if (!pickBlogMedia || uploadRequest.current || action.busy || mustReview) return;
    const controller = new AbortController();
    uploadRequest.current = controller;
    setUploading(purpose);
    setUploadError(undefined);
    try {
      const result = await pickBlogMedia({
        route: id ? `/admin/blog/${encodeURIComponent(id)}/edit` : "/admin/blog/new",
        draftId: `blog:${id ?? "new"}`,
        locale,
      }, controller.signal, purpose);
      if (uploadRequest.current !== controller || controller.signal.aborted || result.status === "cancelled") return;
      if (result.status === "uploaded") {
        if (purpose === "thumbnail") draft.update(fields => ({ ...fields, thumbnailUrl: result.url }));
        else setMediaUrls(previous => ({ ...previous, file: result.url }));
      } else {
        setUploadError({ purpose, message: {
          unavailable: "Berkas belum dapat dipilih.",
          type: purpose === "body" ? "Pilih JPEG, PNG, WebP, GIF, MP4, atau WebM." : "Pilih gambar JPEG, PNG, WebP, atau GIF.",
          size: "Ukuran berkas maksimal 20 MB.",
          forbidden: "Sesi Admin aktif dan draf yang valid diperlukan.",
          uncertain: purpose === "body" ? "Unggahan belum dapat dipastikan. Pilih berkas yang sama untuk memeriksa kembali." : "Hasil unggahan belum dapat dipastikan. Periksa pustaka media.",
        }[result.status] });
      }
    } catch {
      if (!controller.signal.aborted) setUploadError({ purpose, message: "Berkas belum dapat dipilih." });
    } finally {
      if (uploadRequest.current === controller) {
        uploadRequest.current = null;
        if (!controller.signal.aborted) setUploading(null);
      }
    }
  }

  return <Screen title={article ? "Sunting" : "Tulis artikel"} description={article?.title} back={{ label: "Blog", run: leave }}>
    <View style={styles.row}>
      <Action onPress={leave} disabled={action.busy}>Batal</Action>
      <Action variant="default" onPress={submit} busy={action.busy} disabled={mustReview || Boolean(uploading)}>Simpan artikel</Action>
    </View>
    <Feedback {...action} />
    {mustReview && !latest && <Action onPress={inspectLatest} busy={checking}>Muat revisi terbaru</Action>}
    {latest && <RevisionReview key={latest.revision} baseline={draft.baseline} local={value} saved={articleFields(latest)}
      onClose={() => setLatest(null)} onResolve={fields => {
        selection.current = null;
        draft.resolve(fields, articleFields(latest), latest.revision);
        setNeedsReview(false);
        setLatest(null);
        action.setError(undefined);
      }} />}
    <Field label="Judul artikel (opsional)" value={value.title} placeholder="Judul dapat diambil dari heading pertama" onChangeText={next => edit("title", next)} />
    <Field label="Ringkasan (opsional)" value={value.summary} multiline onChangeText={next => edit("summary", next)} />
    {!value.summary.trim() && <Copy muted>Jika kosong, AI akan merangkum isi artikel saat disimpan.</Copy>}
    <Heading>Konten (Markdown)</Heading>
    <Sections variant="inline" current={mode} values={[["write", "Tulis"], ["preview", "Pratinjau"]]} onChange={setMode} />
    {mode === "write" ? <>
      <Field label="Konten (Markdown)" value={value.content} multiline style={{ minHeight: 180 }}
        onSelectionChange={event => { selection.current = event.nativeEvent.selection; }} onChangeText={next => edit("content", next)} />
      <View style={styles.row}><Action disabled={uploading === "body"} onPress={() => setMedia(!media)}>{media ? "Tutup media" : "Sisipkan media"}</Action></View>
      {media && <Section title="Sisipkan media">
        {uploading !== "body" ? <Choices current={mediaMode} values={[["file", "Berkas"], ["youtube", "YouTube"], ["link", "Tautan"]]}
          onChange={next => { setMediaMode(next); setUploadError(undefined); }} /> : null}
        {mediaMode === "file" ? <>
          {pickBlogMedia && <Action testID="native-blog-body-upload" onPress={() => void uploadMedia("body")} busy={uploading === "body"}
            disabled={Boolean(uploading) || action.busy || mustReview}>Unggah gambar atau video</Action>}
          {mediaUrl ? <Field label="URL berkas" value={mediaUrl} editable={false} /> : null}
        </> : <Field label={mediaMode === "youtube" ? "Tautan YouTube" : "URL media"} value={mediaUrl}
          onChangeText={next => { setUploadError(undefined); setMediaUrls(previous => ({ ...previous, [mediaMode]: next })); }}
          autoCapitalize="none" keyboardType="url" />}
        {uploadError?.purpose === "body" && <Copy status="error">{uploadError.message}</Copy>}
        <Field label="Keterangan media" value={mediaCaption} onChangeText={setMediaCaption} />
        <Field label="Nama sumber" value={mediaSource} onChangeText={setMediaSource} />
        <Field label="URL sumber" value={mediaSourceUrl} onChangeText={setMediaSourceUrl} autoCapitalize="none" keyboardType="url" />
        <Action disabled={Boolean(uploading) || action.busy || !mediaUrl.trim()} onPress={insertMedia}>Sisipkan media</Action>
      </Section>}
    </> : <Section>
      <Heading>{articleTitle(value) || "Judul artikel"}</Heading>
      {value.summary && <Copy muted>{value.summary}</Copy>}
      {value.content ? renderMarkdown?.(value.content) ?? <Copy>{value.content}</Copy> : <Copy muted>Konten masih kosong.</Copy>}
    </Section>}
    <Section title="Pengaturan publikasi">
      <Copy strong>Status</Copy><Choices values={articleStatuses} current={value.status} onChange={next => edit("status", next)} />
      <Copy strong>Kategori</Copy><Choices values={categories} current={value.category} onChange={next => edit("category", next)} />
      <Field label="Thumbnail utama" value={value.thumbnailUrl} autoCapitalize="none" keyboardType="url" editable={uploading !== "thumbnail"} onChangeText={next => { setUploadError(undefined); edit("thumbnailUrl", next); }} />
      {pickBlogMedia && <Action onPress={() => void uploadMedia("thumbnail")} busy={uploading === "thumbnail"} disabled={Boolean(uploading) || action.busy || mustReview}>Unggah thumbnail</Action>}
      {uploadError?.purpose === "thumbnail" && <Copy status="error">{uploadError.message}</Copy>}
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
