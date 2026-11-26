import { type ComponentRef, useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { courseHref, learningLiveJoinApi, type LearningData } from "../../../../../packages/native-parity/student/learning/contracts";
import { createLiveQuizSocketHook, type LeaderboardEntry } from "../../../../../packages/native-parity/student/learning/live-socket";
import { CourseVideoDialog } from "../../course-video/CourseVideoDialog";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { studentLiveBrowserPath } from "../browser-handoff";
import type { StudentScreenProps } from "../contracts";
import { CourseMarkdown } from "../CourseMarkdown";
import { Copy, Message, Row, Section, english, launchWeb, postJson, readJson, RequestError, styles, useLearningColors, type Translate } from "./ui";

const useLiveQuizSocket = createLiveQuizSocketHook({ useCallback, useEffect, useRef, useState });

type Ready<View extends LearningData["view"]> = Extract<LearningData, { state: "ready"; view: View }>;

export function PlaygroundContent({ props }: { props: StudentScreenProps }) {
  const [failed, setFailed] = useState(false);
  const isEnglish = english(props.session.locale);
  const path = courseHref(props.route.params.id, "/playground");
  const handoff = props.route.query.handoff;
  return <Section>
    <Button style={styles.action} onPress={() => setFailed(!launchWeb(props, handoff ? `${path}?handoff=${encodeURIComponent(handoff)}` : path))}>
      {isEnglish ? "Open Python playground" : "Buka Playground Python"}
    </Button>
    {failed ? <Message>{isEnglish ? "The Python editor is unavailable in this app." : "Editor Python tidak tersedia di aplikasi ini."}</Message> : null}
  </Section>;
}

export function VideoContent({ data, props, t }: { data: Ready<"video">; props: StudentScreenProps; t: Translate }) {
  const [search, setSearch] = useState("");
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = data.playlists.flatMap(p => p.videos).find(v => v.id === selectedId && !v.locked);
  const { request } = props;
  const buttons = useRef(new Map<string, ComponentRef<typeof View>>());
  const trigger = useRef<ComponentRef<typeof View> | null>(null);
  const load = useCallback((signal: AbortSignal) => readJson<{ url: string; fallbackUrl?: string }>(request,
    `/api/videos/${encodeURIComponent(selectedId ?? "")}/playback-url`, { signal }), [request, selectedId]);
  const isEnglish = english(props.session.locale);
  const colors = useLearningColors();
  const term = search.trim().toLocaleLowerCase();
  const filtered = data.playlists.map((playlist) => ({ ...playlist, videos: playlist.videos.filter((video) =>
    (!chapterId || video.chapterId === chapterId) && (!term || [playlist.title, video.title, video.chapterTitle, video.description]
      .some((text) => text?.toLocaleLowerCase().includes(term))),
  ) })).filter((playlist) => (!term && !chapterId) || playlist.videos.length > 0);
  const videoLabel = (key: string) => t(`studentCourse.courseVideos.${key}`);
  return <>
    {!data.hasFullContentAccess ? <Message action={isEnglish ? "Activate course" : "Aktifkan kelas"} onAction={() => props.navigate(courseHref(props.route.params.id))}>
      {t("learning.videoPage.activationDescription")}
    </Message> : null}
    {data.playlists.length > 0 ? <Section>
      <Input value={search} onChangeText={setSearch} accessibilityLabel={videoLabel("search")} placeholder={videoLabel("search")} style={styles.field} />
      {data.chapters.length > 0 ? <View style={styles.wrap} accessibilityRole="radiogroup">
        {[{ id: null, title: videoLabel("allChapters") }, ...data.chapters].map(({ id, title }) => <Button key={id ?? "all"}
          accessibilityRole="radio" accessibilityState={{ checked: chapterId === id }} variant={chapterId === id ? "default" : "outline"}
          onPress={() => setChapterId(id)} style={{ ...styles.action, maxWidth: "100%" }}>{title}</Button>)}
      </View> : null}
    </Section> : null}
    {!filtered.length ? <Copy muted>{term || chapterId ? (isEnglish ? "No videos match this filter." : "Tidak ada video yang cocok.") : videoLabel("noVideos")}</Copy> : null}
    {filtered.map((playlist) => {
      const expanded = !collapsed.has(playlist.id);
      return <Section key={playlist.id}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded }} style={[styles.row, styles.rowMain, { borderColor: colors.border }]}
          onPress={() => setCollapsed((current) => {
            const next = new Set(current);
            if (next.has(playlist.id)) next.delete(playlist.id);
            else next.add(playlist.id);
            return next;
          })}>
          <Copy heading>{playlist.title}</Copy><Copy muted>{playlist.videos.length} {expanded ? "▴" : "▾"}</Copy>
        </Pressable>
        {expanded ? <>
          {playlist.description ? <Copy muted>{playlist.description}</Copy> : null}
          {!playlist.videos.length ? <Copy muted>{videoLabel("emptyPlaylist")}</Copy> : null}
          {playlist.videos.map((video) => <Row key={video.id} title={video.title} detail={video.chapterTitle ?? undefined}
            value={video.duration == null ? undefined : `${Math.floor(video.duration / 60)}:${String(video.duration % 60).padStart(2, "0")}`}>
            {video.thumbnailUrl?.startsWith("https://") ? <Image source={{ uri: video.thumbnailUrl }} style={{ width: 120, height: 68, borderRadius: 6 }} /> : null}
            {video.description ? <Copy muted>{video.description}</Copy> : null}
            {video.locked ? <Copy muted>{t("learning.courseAccess.limited")}</Copy> : <Button variant={props.route.query.video === video.id ? "default" : "outline"} style={styles.action}
              ref={node => { if (node) buttons.current.set(video.id, node); else buttons.current.delete(video.id); }}
              accessibilityLabel={`${videoLabel("play")}: ${video.title}`}
              onPress={() => { trigger.current = buttons.current.get(video.id) ?? null; setSelectedId(video.id); }}>{videoLabel("play")}</Button>}
          </Row>)}
        </> : null}
      </Section>;
    })}
    {selected && <CourseVideoDialog key={selected.id} title={selected.title} locale={props.session.locale}
      origin={props.session.origin} load={load} close={() => setSelectedId(null)} returnFocusRef={trigger} />}
  </>;
}

type LiveJoin = { sessionId: string; token: string; wsUrl: string | null };

function signedEndpoint(join: LiveJoin) {
  if (!join.wsUrl || !join.token) return null;
  try {
    const endpoint = new URL(join.wsUrl);
    if (!["https:", "wss:"].includes(endpoint.protocol) || endpoint.username || endpoint.password) return null;
    endpoint.searchParams.set("token", join.token);
    return endpoint.href;
  } catch {
    return null;
  }
}

function LiveBoard({ title, rows, rank, score, t }: { title: string; rows: LeaderboardEntry[]; rank: number | null; score: number; t: Translate }) {
  return <Section title={title}>
    {rank && !rows.some((item) => item.rank === rank) ? <Row title={`${rank}. ${t("live.you")}`} value={String(score)} /> : null}
    {rows.map((item) => <Row key={item.userId} title={`${item.rank}. ${item.name}`} value={String(item.score)} />)}
  </Section>;
}

function LiveCodingHandoff({ props }: { props: StudentScreenProps }) {
  const [failed, setFailed] = useState(false);
  const en = english(props.session.locale);
  return <View style={styles.section}>
    <Copy>{en
      ? "Sign in with the same account in your browser, then rejoin the live quiz with the room code to open the coding exercise."
      : "Masuk dengan akun yang sama di browser, lalu gabung kembali ke kuis langsung dengan kode ruang untuk membuka latihan kode."}</Copy>
    {props.openExternal ? <Button variant="outline" style={styles.action}
      onPress={() => setFailed(!launchWeb(props, studentLiveBrowserPath(props.route.params.id)))}>
      {en ? "Open live quiz in browser" : "Buka kuis langsung di browser"}
    </Button> : null}
    {failed || !props.openExternal ? <Message>{en
      ? "Open the live quiz from the course page in your browser."
      : "Buka kuis langsung dari halaman kelas di browser."}</Message> : null}
  </View>;
}

function ConnectedLive({ data, props, t, code, initialEndpoint, leave }: {
  data: Ready<"live">; props: StudentScreenProps; t: Translate; code: string; initialEndpoint: string; leave: () => void;
}) {
  const refresh = useCallback(async () => {
    try {
      return signedEndpoint(await readJson<LiveJoin>(props.request, learningLiveJoinApi, postJson({ code, courseId: data.joinCourseId })));
    } catch (error) {
      if (error instanceof RequestError && [401, 403, 404, 410].includes(error.status)) return null;
      throw error;
    }
  }, [code, data.joinCourseId, props.request]);
  const { state, sendAnswer } = useLiveQuizSocket(initialEndpoint, refresh);
  const colors = useLearningColors();
  const question = state.currentQuestion;
  const phase = state.sessionState;
  const render = (source: string, allowLinks = true) => props.renderAssessmentMarkdown?.(source, props.route.params.id) ??
    <CourseMarkdown source={source} services={props} allowLinks={allowLinks} />;
  return <>
    <Copy muted>{t(`live.${state.connectionStatus}`)}</Copy>
    {state.connectionStatus === "disconnected" && phase !== "ended" ? <Message action={t("live.join")} onAction={leave}>{t("live.connectionRetry")}</Message> : null}
    {phase === "lobby" ? <Section title={t("live.waitingLobby")}><Copy>{t("live.participantsJoined", { count: state.participantCount })}</Copy></Section> : null}
    {question && (phase === "question" || phase === "reveal") ? <Section title={question.total > 0
      ? t("live.questionPosition", { current: question.questionIndex + 1, total: question.total })
      : t("live.question", { number: question.questionIndex + 1 })}>
      {phase === "question" ? <Copy>{t("live.timeRemaining", { seconds: state.countdown })}</Copy> : null}
      {render(question.prompt)}
      {question.coding ? <LiveCodingHandoff props={props} /> : null}
      <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
        {question.options.map((option, index) => {
          const correct = phase === "reveal" && index === state.revealCorrectIndex;
          const selected = state.myAnswer === index;
          const disabled = state.connectionStatus !== "connected" || state.myAnswer !== null || phase !== "question" || state.countdown <= 0;
          return <Pressable key={index} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} disabled={disabled}
            style={{ borderColor: correct || selected ? colors.primary : colors.border, borderWidth: 1, borderRadius: 8, minHeight: 44, padding: 10, gap: 5 }}
            onPress={() => sendAnswer(question.questionIndex, index)}>
            <Copy muted>{`${String.fromCharCode(65 + index)}${correct ? ` · ${t("live.correct")}` : ""}`}</Copy>
            {render(option, false)}
          </Pressable>;
        })}
      </View>
      {question.sourceEventName ? <Copy muted>{question.sourceEventName}</Copy> : null}
      {state.myAnswer !== null && phase === "question" ? <Copy muted>{t("live.answerLocked")}</Copy> : null}
    </Section> : null}
    {phase === "reveal" && state.top10.length > 0 ? <LiveBoard title={t("live.leaderboard")} rows={state.top10} rank={state.yourRank} score={state.yourScore} t={t} /> : null}
    {phase === "ended" ? <>
      <Section title={t("live.sessionEnded")}><Copy>{t("live.finalScore", { score: state.yourScore })}</Copy></Section>
      <LiveBoard title={t("live.finalLeaderboard")} rows={state.finalBoard.slice(0, 10)} rank={state.yourRank} score={state.yourScore} t={t} />
    </> : null}
  </>;
}

export function LiveContent({ data, props, t }: { data: Ready<"live">; props: StudentScreenProps; t: Translate }) {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [joined, setJoined] = useState<{ endpoint: string; code: string; sessionId: string }>();
  const busy = useRef(false);
  async function join() {
    if (busy.current) return;
    const input = code.trim().toUpperCase();
    if (input.length !== 6) { setError(t("live.invalidCode")); return; }
    busy.current = true;
    setPending(true);
    setError(undefined);
    try {
      const result = await readJson<LiveJoin>(props.request, learningLiveJoinApi, postJson({ code: input, courseId: data.joinCourseId }));
      const endpoint = signedEndpoint(result);
      if (!endpoint) throw new Error("Invalid socket endpoint");
      setJoined({ endpoint, code: input, sessionId: result.sessionId });
    } catch {
      setError(t("live.joinFailed"));
    } finally {
      setPending(false);
      busy.current = false;
    }
  }
  if (!data.enabled) return <Section title={t("live.noSessionTitle")}><Copy muted>{t("live.noSessionDescription")}</Copy></Section>;
  if (joined) return <ConnectedLive key={joined.sessionId} data={data} props={props} t={t} code={joined.code} initialEndpoint={joined.endpoint} leave={() => setJoined(undefined)} />;
  return <Section title={t("live.joinTitle")}>
    <View style={styles.wrap}>
      <Input value={code} accessibilityLabel={t("live.sessionCode")} placeholder={t("live.sessionCodePlaceholder")} autoCapitalize="characters"
        autoCorrect={false} maxLength={6} onChangeText={(value) => { setCode(value.toUpperCase()); setError(undefined); }} onSubmitEditing={() => void join()}
        style={{ flex: 1, minWidth: 130, minHeight: 44 }} />
      <Button style={styles.action} disabled={!code.trim()} isLoading={pending} onPress={() => void join()}>{t("live.join")}</Button>
    </View>
    {error ? <Message>{error}</Message> : null}
  </Section>;
}
