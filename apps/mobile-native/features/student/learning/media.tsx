import { type ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { courseHref, learningLiveJoinApi, type LearningData } from "../../../../../packages/native-parity/student/learning/contracts";
import { createLiveQuizSocketHook, type LeaderboardEntry } from "../../../../../packages/native-parity/student/learning/live-socket";
import { createCoursePlaybackMemory, playableVideoNeighbors } from "./video-playback";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { CourseVideoDialog } from "../../course-video/CourseVideoDialog";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { liveCodingConfigSchema } from "../../../../../lib/coding/live-config";
import { NativeLiveCoding } from "./live-coding";
import { canStartLiveCoding, liveCodingKey, signedLiveEndpoint, type LiveJoin } from "./live-coding-contract";
import type { StudentScreenProps } from "../contracts";
import { CourseMarkdown } from "../CourseMarkdown";
import { Copy, Message, Row, Section, english, postJson, readJson, RequestError, styles, useLearningColors, type Translate } from "./ui";

const useLiveQuizSocket = createLiveQuizSocketHook({ useCallback, useEffect, useRef, useState });

type Ready<View extends LearningData["view"]> = Extract<LearningData, { state: "ready"; view: View }>;

export function VideoContent({ data, props, t }: { data: Ready<"video">; props: StudentScreenProps; t: Translate }) {
  const [search, setSearch] = useState("");
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [selection, setSelection] = useState<{ id: string; startTime: number }>();
  const [queueOpen, setQueueOpen] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const { canInteract } = useProtectedInteraction();
  const { request } = props;
  const courseId = props.route.params.id;
  const routeVideo = props.route.query.video;
  const memory = useMemo(() => createCoursePlaybackMemory(props.drafts, courseId), [courseId, props.drafts]);
  const selectionVersion = useRef(0);
  const allowedVideos = useRef(data.playlists);
  allowedVideos.current = data.playlists;
  const selectedId = selection?.id;
  const playlist = data.playlists.find(p => p.videos.some(v => v.id === selectedId && !v.locked));
  const selected = playlist?.videos.find(v => v.id === selectedId && !v.locked);
  const adjacent = selected && playlist ? playableVideoNeighbors(playlist.videos, selected.id) : undefined;
  const buttons = useRef(new Map<string, ComponentRef<typeof View>>());
  const trigger = useRef<ComponentRef<typeof View> | null>(null);
  const load = useCallback((signal: AbortSignal) => readJson<{ url: string; fallbackUrl?: string }>(request,
    `/api/videos/${encodeURIComponent(selectedId ?? "")}/playback-url`, { signal }), [request, selectedId]);

  async function selectVideo(id?: string, restore = false) {
    const token = ++selectionVersion.current;
    const saved = await memory.read().catch(() => undefined);
    if (token !== selectionVersion.current || !canInteract()) return;
    const candidate = restore ? id ?? saved?.active?.videoId : id;
    if (!candidate || !allowedVideos.current.some(group => group.videos.some(video => video.id === candidate && !video.locked))) {
      if (restore) setSelection(undefined);
      return;
    }
    setSelection({ id: candidate, startTime: saved?.progress[candidate]?.time ?? 0 });
    if (!restore) setQueueOpen(false);
    void memory.activate(candidate).catch(() => {});
  }

  useEffect(() => {
    void selectVideo(routeVideo, true);
    return () => { selectionVersion.current++; };
  }, [memory, routeVideo]);
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
              onPress={() => { trigger.current = buttons.current.get(video.id) ?? null; void selectVideo(video.id); }}>{videoLabel("play")}</Button>}
          </Row>)}
        </> : null}
      </Section>;
    })}
    {selected && selection && <CourseVideoDialog key={selected.id} title={selected.title} locale={props.session.locale}
      origin={props.session.origin} load={load} close={() => {
        selectionVersion.current++;
        setSelection(undefined);
        setQueueOpen(false);
        void memory.activate(null).catch(() => {});
      }} returnFocusRef={trigger} playback={{
        startTime: selection.startTime,
        checkpoint: (time, duration) => { void memory.checkpoint(selected.id, time, duration).catch(() => {}); },
        ended: () => {
          void memory.checkpoint(selected.id, 0).catch(() => {});
          if (autoAdvance && adjacent?.next && canInteract()) void selectVideo(adjacent.next.id);
        },
      }} controls={playlist && playlist.videos.length > 1 ? <View style={{ gap: 8 }}>
        <View style={styles.wrap}>
          <Button variant="outline" disabled={!adjacent?.previous} testID="student-course-video-previous"
            onPress={() => void selectVideo(adjacent?.previous?.id)}>{videoLabel("previous")}</Button>
          <Button variant="outline" disabled={!adjacent?.next} testID="student-course-video-next"
            onPress={() => void selectVideo(adjacent?.next?.id)}>{videoLabel("next")}</Button>
          <Button variant="outline" accessibilityState={{ expanded: queueOpen }} testID="student-course-video-queue"
            onPress={() => setQueueOpen(value => !value)}>{videoLabel(queueOpen ? "closeVideoList" : "videoList")}</Button>
        </View>
        {queueOpen && <>
          <Button variant="outline" accessibilityRole="switch" accessibilityLabel={videoLabel("autoplayNext")}
            accessibilityState={{ checked: autoAdvance }} testID="student-course-video-auto-advance"
            onPress={() => setAutoAdvance(value => !value)}>{`${videoLabel("autoplayNext")}: ${videoLabel(autoAdvance ? "enabled" : "disabled")}`}</Button>
          {playlist.videos.map(item => <Row key={item.id} title={item.title}
            detail={item.locked ? t("learning.courseAccess.limited") : item.id === selectedId ? videoLabel("playing") : undefined}
            onPress={!item.locked && item.id !== selectedId ? () => void selectVideo(item.id) : undefined} />)}
        </>}
      </View> : undefined} />}

  </>;
}

function LiveBoard({ title, rows, rank, score, t }: { title: string; rows: LeaderboardEntry[]; rank: number | null; score: number; t: Translate }) {
  return <Section title={title}>
    {rank && !rows.some((item) => item.rank === rank) ? <Row title={`${rank}. ${t("live.you")}`} value={String(score)} /> : null}
    {rows.map((item) => <Row key={item.userId} title={`${item.rank}. ${item.name}`} value={String(item.score)} />)}
  </Section>;
}

function ConnectedLive({ data, props, t, code, initialEndpoint, sessionId, leave }: {
  data: Ready<"live">; props: StudentScreenProps; t: Translate; code: string; initialEndpoint: string; sessionId: string; leave: () => void;
}) {
  const refresh = useCallback(async () => {
    try {
      const joined = await readJson<LiveJoin>(props.request, learningLiveJoinApi, postJson({ code, courseId: data.joinCourseId }));
      return signedLiveEndpoint(joined, sessionId);
    } catch (error) {
      if (error instanceof RequestError && [401, 403, 404, 410].includes(error.status)) return null;
      throw error;
    }
  }, [code, data.joinCourseId, props.request, sessionId]);
  const { state, sendAnswer, synchronized } = useLiveQuizSocket(initialEndpoint, refresh, false);
  const colors = useLearningColors();
  const question = state.currentQuestion;
  const phase = state.sessionState;
  const codingQuestion = question?.coding != null;
  const coding = question && codingQuestion ? liveCodingConfigSchema.safeParse(question.coding) : null;
  const scope = question && coding && coding.success && Number.isSafeInteger(question.questionIndex) && question.questionIndex >= 0
    ? { courseId: data.joinCourseId, roomId: sessionId, index: question.questionIndex, config: coding.data } : null;
  const ready = synchronized && state.connectionStatus === "connected" && props.focused !== false;
  const codingOpen = canStartLiveCoding({ synchronized, connected: ready, phase, deadline: question?.deadline ?? 0 });
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
      {codingQuestion && ready && scope
        ? <NativeLiveCoding key={liveCodingKey(scope)} props={props} scope={scope} deadline={question.deadline} open={codingOpen} />
        : codingQuestion && ready ? <Message>{english(props.session.locale) ? "The Python exercise is unavailable." : "Latihan Python tidak tersedia."}</Message>
          : !codingQuestion ? render(question.prompt) : null}
      {!codingQuestion && <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
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
      </View>}
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
      const endpoint = signedLiveEndpoint(result);
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
  if (joined) return <ConnectedLive key={joined.sessionId} data={data} props={props} t={t} code={joined.code} initialEndpoint={joined.endpoint} sessionId={joined.sessionId} leave={() => setJoined(undefined)} />;
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
