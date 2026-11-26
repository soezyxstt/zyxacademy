import { useEffect, useRef, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import idNotifications from "../../../../../messages/id/notifications.json";
import enNotifications from "../../../../../messages/en/notifications.json";
import { emailCategoryPreference, isEmailNotificationCategory, type EmailNotificationCategory } from "../../../../../lib/email-preferences/contracts";
import { demoViews, isNativeDemoContentView, type PublicRoute } from "../../../../../packages/native-parity/operations/public-contract";
import { NativeDemoContent } from "./demo-content";
import { Action, Divider, Hero, Label, layout, RowLink, StatePanel, textWith, usePublic, usePublicResource } from "./ui";

export function Download() {
  const { client, copy: { download }, colors } = usePublic();
  const { width } = useWindowDimensions();
  const { resource, retry } = usePublicResource("download", client, (api, signal) => api.release(signal));
  const data = resource.status === "ready" ? resource.value : null;
  const release = data?.release;
  const downloads = release?.downloads;
  const channel = data?.channel === "nightly" ? "Nightly" : "Stable";
  const platforms = [
    { name: "Windows", format: "EXE · x64", url: downloads?.windows },
    { name: "Android", format: "APK", url: downloads?.android },
    { name: "Debian", format: "DEB · x64", url: downloads?.linuxDeb },
    { name: "Linux", format: "AppImage · x64", url: downloads?.linuxAppImage },
    { name: "macOS" },
    { name: "iPhone" },
  ];
  return <View style={layout.stack} testID="public-download">
    <Hero title={download.title} description={download.description} centered />
    <View style={layout.between}>
      <Label tone="subheading">{download.platforms}</Label>
      {release && <Action href={release.releaseUrl} external variant="link">{`${channel} ${release.version}${release.buildId ? ` (${release.buildId})` : ""}`}</Action>}
    </View>
    {resource.status === "loading" && <StatePanel kind="loading" />}
    {resource.status === "error" && <StatePanel kind="error" title={download.error} retry={retry} />}
    {resource.status === "ready" && !release && <Label tone="meta" live="polite">{textWith(download.empty, { channel })}</Label>}
    <View style={layout.row}>
      {platforms.map(({ name, format, url }) => <View key={name} style={{
        minHeight: 64, flexGrow: 1, flexBasis: width < 360 ? "100%" : "44%", borderWidth: 1,
        borderRadius: 10, borderColor: colors.border, backgroundColor: url ? colors.background : colors.muted + "55",
        justifyContent: "center", padding: 8,
      }}>
        {url ? <Action href={url} external accessibilityLabel={`${download.verb} ${name} (${format})`}>{`${name} · ${format}`}</Action> : <View accessibilityState={{ disabled: true }}>
          <Label>{name}</Label><Label tone="meta">{download.unavailable}</Label>
        </View>}
      </View>)}
    </View>
  </View>;
}

type DemoRoute = Extract<PublicRoute, { kind: "demo" }>;
export function Demo({ route }: { route: DemoRoute }) {
  const { client, copy, locale, onBack, onNavigate } = usePublic();
  const { demo, meta } = copy;
  const { resource, retry } = usePublicResource("demo", client, (api, signal) => api.demo(signal));
  const { view } = route;
  const courseId = route.course;
  const title = view ? demo.views[view as keyof typeof demo.views] ?? view.split("-").map((word) => word.at(0)?.toUpperCase() + word.slice(1)).join(" ") : demo.dashboard.title;
  if (resource.status !== "ready") return <View style={layout.section}>
    <Hero title={meta.demo.title} />
    <StatePanel kind={resource.status} retry={resource.status === "error" ? retry : undefined} />
  </View>;
  const { courses, showLive } = resource.value;
  if (courses.length === 0) return <View style={layout.section}><StatePanel kind="empty" title={demo.emptyTitle} description={demo.emptyDescription} />
    <Action href="/sign-up" variant="default">{copy.home.startFree}</Action></View>;
  const course = courseId ? courses.find((item) => item.id === courseId) : courses[0];
  if (!course) return <View style={layout.stack}><StatePanel kind="empty" />
    <Action href="/demo">{demo.backToDemo}</Action></View>;
  const courseQuery = `?course=${encodeURIComponent(course.id)}`;
  const selection = new URLSearchParams(route.search);
  if (!selection.has("course")) selection.set("course", course.id);
  const search = `?${selection.toString()}`;
  const handoff = `/demo/${view ?? "overview"}${search}`;
  return <View style={layout.stack} testID={view ? "public-demo-view" : "public-demo"}>
    {view && <View style={layout.row}><Action onPress={() => {
      const fallback = `/demo${search}`;
      if (onBack) onBack(fallback);
      else onNavigate(fallback);
    }} variant="link">{demo.backToDemo}</Action></View>}
    <Hero title={title} description={view ? undefined : demo.dashboard.subtitle} />
    <View style={layout.row}>
      {courses.map((item) => <Action key={item.id} variant={course.id === item.id ? "default" : "outline"}
        href={`/demo${view ? `/${view}` : ""}?course=${encodeURIComponent(item.id)}`}>{item.title}</Action>)}
    </View>
    <Divider />
    <View style={layout.item}>
      <Label tone="subheading">{course.chapterTitle}</Label>
      {!!course.description && <Label>{course.description}</Label>}
    </View>
    {view ? <>
      {isNativeDemoContentView(view) && <NativeDemoContent view={view} search={search} />}
      {view === "courses" && <View style={layout.section}>
        {courses.map((item) => <View key={item.id} style={layout.item}>
          <Label tone="subheading">{item.title}</Label>
          {!!item.description && <Label>{item.description}</Label>}
          <Action href={`/demo/overview?course=${encodeURIComponent(item.id)}`}>{demo.readMore}</Action>
        </View>)}
      </View>}
      <Action href={handoff} external variant={view === "courses" || isNativeDemoContentView(view) ? "link" : "default"}>{locale === "id" ? "Buka demo di browser" : "Open demo in browser"}</Action>
    </> : <>
      {!!course.article && <View style={layout.section}>
        <Label tone="subheading">{course.article.title}</Label>
        <Action href={`/demo/article${courseQuery}&articleId=${encodeURIComponent(course.article.id)}`} variant="default">{demo.dashboard.startArticle}</Action>
      </View>}
      <View style={layout.row} accessibilityLabel={demo.navLabel}>
        {demoViews.filter((item) => item !== "live" || showLive).map((item) => (
          <Action key={item} href={`/demo/${item}${courseQuery}`}>{demo.views[item as keyof typeof demo.views] ?? item.replaceAll("-", " ")}</Action>
        ))}
      </View>
    </>}
    <Divider />
    <Label tone="subheading">{demo.dashboard.saveTitle}</Label>
    <Label>{demo.dashboard.saveDescription}</Label>
    <View style={layout.row}><Action href="/sign-in">{demo.authCta}</Action></View>
  </View>;
}

type UnsubscribeRoute = Extract<PublicRoute, { kind: "unsubscribe" }>;
export function Unsubscribe({ route }: { route: UnsubscribeRoute }) {
  const { client, locale, copy } = usePublic();
  const { email } = locale === "id" ? idNotifications : enNotifications;
  const ui = email.unsubscribe;
  const successCategory = route.status === "success" && isEmailNotificationCategory(route.category) ? route.category : null;
  const token = successCategory ? null : route.token;
  const { resource, retry } = usePublicResource(token ?? "unsubscribe", client, (api, signal) =>
    token ? api.unsubscribe(token, "inspect", signal) : Promise.resolve(null));
  const [confirmed, setConfirmed] = useState<EmailNotificationCategory | null>(null);
  const [invalidated, setInvalidated] = useState(false);
  const [confirmationError, setConfirmationError] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);
  const category = successCategory ?? confirmed ?? (resource.status === "ready" ? resource.value : null);
  const categoryLabel = category ? email.categories[emailCategoryPreference[category]].label : "";
  const confirm = () => {
    if (!token || inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setBusy(true);
    setConfirmationError(false);
    void client.unsubscribe(token, "confirm", controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      if (value) setConfirmed(value);
      else setInvalidated(true);
    }, () => {
      if (!controller.signal.aborted) setConfirmationError(true);
    }).finally(() => {
      if (inFlight.current === controller) inFlight.current = null;
      if (!controller.signal.aborted) setBusy(false);
    });
  };

  return <View style={layout.section} testID="public-unsubscribe">
    {successCategory || confirmed ? <>
      <Hero compact title={ui.successTitle} description={textWith(ui.successBody, { category: categoryLabel })} />
      <Divider /><Action href="/settings/notifications">{ui.manageAll}</Action>
    </> : token && resource.status !== "ready" ? <>
      <Hero compact title={ui.title} />
      <StatePanel kind={resource.status} retry={resource.status === "error" ? retry : undefined} />
    </> : category && !invalidated ? <>
      <Hero compact title={textWith(ui.confirmTitle, { category: categoryLabel })} description={textWith(ui.confirmBody, { category: categoryLabel })} />
      <Divider />
      {confirmationError && <Label tone="error" live="assertive">{copy.home.quizTryAgain}</Label>}
      <View style={layout.row}>
        <Action onPress={confirm} variant="destructive" loading={busy} id="public-unsubscribe-confirm">{ui.unsubscribe}</Action>
        <Action href="/settings/notifications">{ui.manageAll}</Action>
      </View>
    </> : <>
      <Hero compact title={ui.invalidTitle} description={ui.invalidBody} />
      <Divider /><Action href="/settings/notifications">{ui.manage}</Action>
    </>}
  </View>;
}
