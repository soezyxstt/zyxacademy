import { expect, mock, test } from "bun:test";
import { createTranslator } from "next-intl";
import { readdirSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { loadMessages } from "@/lib/i18n/catalogs";
import type { DiscussionChannel, DiscussionMessage as Message } from "@/components/discussions/view-model";
import { DiscussionI18nFixture } from "./discussion-i18n-fixture";
import id from "@/messages/id/discussions.json";
import en from "@/messages/en/discussions.json";

mock.module("@/lib/i18n/actions", () => ({ saveLocaleSelection: async () => ({ success: true }), mirrorResolvedAccountLocaleCookie: async () => {} }));
mock.module("@/hooks/use-url-tab", () => ({ useUrlTab: () => ["questions", () => {}] }));
const { DiscussionChannelPicker, DiscussionMessage, discussionChannelLabel } = await import("@/components/discussions/discussion-message");
const { discussionAudienceKey, discussionPrivacyKey } = await import("@/components/discussions/discussion-workspace");
const { DiscussionReportedMessage, DiscussionReports } = await import("@/components/discussions/discussion-reports");
const { DiscussionFixture } = await import("@/components/discussions/discussion-fixture");

test("discussion catalogs load, match keys and interpolate values in both locales", async () => {
  expect(Object.keys(en).sort()).toEqual(Object.keys(id).sort());
  for (const key of Object.keys(id) as Array<keyof typeof id>) {
    const argumentsFor = (value: string) => [...value.matchAll(/\{([a-zA-Z][\w]*)(?=\s*[,}])/g)].map((match) => match[1]).sort();
    expect(argumentsFor(en[key])).toEqual(argumentsFor(id[key]));
  }
  for (const locale of ["id", "en"] as const) {
    const messages = await loadMessages(locale);
    expect(messages.discussions).toEqual(locale === "id" ? id : en);
    const t = createTranslator({ locale, messages, namespace: "discussions" });
    expect(t("unreadQuestions", { count: 2 })).toContain("2");
    expect(t("messageActionsFor", { name: "Nadia", seq: 1, excerpt: "Teks" })).toContain("Nadia");
    expect(t("messageNumber", { name: "Raka", number: 45 })).toContain("45");
  }
});

test("literal discussion translation keys exist in the catalog", () => {
  for (const file of readdirSync("components/discussions").filter((name) => name.endsWith(".tsx"))) {
    const source = readFileSync(`components/discussions/${file}`, "utf8");
    for (const match of source.matchAll(/\bt\("([a-zA-Z][\w]*)"/g)) {
      expect(id).toHaveProperty(match[1]);
      expect(en).toHaveProperty(match[1]);
    }
  }
  for (const key of ["sendError_resolved", "sendError_unavailable", "sendError_invalid", "sendError_rate_limited", "sendError_conflict", "sendError_unknown", "uploadError_pixels", "uploadError_size", "uploadError_format", "uploadError_rate_limited", "uploadError_login", "uploadError_access", "uploadError_unknown", "ai_pending", "ai_processing", "ai_failed", "ai_uncertain", "ai_freeTextOnly", "ai_imageLimit", "ai_imageDisabled", "ai_imageUnavailable", "ai_requestTooLarge", "ai_assessmentActive", "ai_quota", "ai_sourceChanged"]) {
    expect(id).toHaveProperty(key);
    expect(en).toHaveProperty(key);
  }
});

test("English controls retain authored message, course name and report reason", () => {
  const channel: DiscussionChannel = { id: "course", kind: "course", name: "Matematika I", courseId: "course", unreadCount: 0, muted: false, canCreate: true };
  const message: Message = { id: "m", author: { id: "a", name: "Nadia", role: "student" }, body: "Teks yang ditulis murid", createdAt: "2026-01-01T00:00:00Z", revision: 1, messageType: "question", attachments: [], reactions: [], canEdit: false, canDelete: false, canReport: true };
  const noop = async () => {};
  const html = renderToStaticMarkup(<DiscussionI18nFixture locale="en"><TooltipProvider>
    <DiscussionChannelPicker value={channel} label="Channel" placeholder="Select a channel" onChange={() => {}} onSearch={async () => ({ items: [], nextCursor: null })} />
    <DiscussionMessage message={message} questionId="q" viewer={message.author} sourceChannel={channel} updateForwardDraft={() => {}} onSearchChannels={async () => ({ items: [], nextCursor: null })} onSearchForwardTargets={async () => ({ items: [], nextCursor: null })} canReply onReply={() => {}} onEdit={noop} onDelete={noop} onReact={noop} onForward={noop} onReport={noop} />
    <DiscussionReports reports={[{ id: "r", questionId: "q", questionTitle: "Judul asli", messageId: "m", reporterName: "Nadia", reason: "Alasan asli", createdAt: "2026-01-01T00:00:00Z", status: "pending" }]} onOpenQuestion={() => {}} />
  </TooltipProvider></DiscussionI18nFixture>);
  for (const text of ["Matematika I", "Teks yang ditulis murid", "Alasan asli", "Student", "Pending", "Reporter and reason"]) expect(html).toContain(text);
  expect(html).toContain("from Nadia: Teks yang ditulis murid");
});

test("private channel labels and audience copy distinguish current course and requester", () => {
  const channel: DiscussionChannel & { kind: "private" } = { id: "private-id", kind: "private", name: "Tim akademik", privateKind: "academic", privacyLabel: "", courseId: "course-id", courseTitle: "Matematika I", isRequester: true, unreadCount: 0, muted: false, canCreate: true };
  const staff = { ...channel, requesterName: "Nadia Putri", isRequester: false };
  for (const [locale, expected, general] of [["id", "Tim akademik, Matematika I", "Tim akademik, Umum"], ["en", "Academic team, Matematika I", "Academic team, General"]] as const) {
    const t = createTranslator({ locale, messages: { discussions: locale === "id" ? id : en }, namespace: "discussions" });
    expect(discussionChannelLabel(channel, t)).toBe(expected);
    expect(discussionChannelLabel({ ...channel, courseId: null }, t)).toBe(general);
    expect(discussionChannelLabel(staff, t)).toContain("Nadia Putri, Matematika I");
    expect(discussionChannelLabel({ ...channel, courseTitle: null }, t)).not.toContain("course-id");
    expect(discussionChannelLabel({ ...channel, name: "Judul pilihan" }, t)).toBe(`Judul pilihan, Matematika I`);
    expect(discussionPrivacyKey({ ...staff, privateKind: "bug" }, "admin")).toBe("privacyAdminStaff");
    expect(discussionPrivacyKey({ ...channel, privateKind: "bug" }, "admin")).toBe("privacyAdmin");
    const html = renderToStaticMarkup(<DiscussionI18nFixture locale={locale}><TooltipProvider><DiscussionChannelPicker value={staff} label="Channel" placeholder="Channel" onChange={() => {}} onSearch={async () => ({ items: [], nextCursor: null })} /></TooltipProvider></DiscussionI18nFixture>);
    expect(html).toContain("Nadia Putri, Matematika I");
    expect(html).not.toContain("private-id");
  }
});

test("public audience copy names eligible members and preserves private policy", () => {
  const base = { id: "channel", name: "Channel", unreadCount: 0, muted: false, canCreate: true };
  expect(discussionAudienceKey({ ...base, kind: "global" }, "student")).toBe("privacyGlobal");
  expect(discussionAudienceKey({ ...base, kind: "course", courseId: "course" }, "student")).toBe("privacyCourse");
  expect(discussionAudienceKey({ ...base, kind: "private", privateKind: "academic", privacyLabel: "", courseId: "course", isRequester: false }, "admin")).toBe("privacyAcademicCourseStaff");
  for (const locale of [id, en]) {
    expect(locale.privacyGlobal).toBeTruthy();
    expect(locale.privacyCourse).toBeTruthy();
    expect(locale.zyraContext).toContain("5");
    expect(locale.zyraQuota).toContain("1");
  }
});

test("unknown backend status is never rendered as an internal value", () => {
  const html = renderToStaticMarkup(<DiscussionI18nFixture locale="en"><DiscussionReports reports={[{ id: "r", questionId: "q", questionTitle: "Question", messageId: "m", reporterName: "Nadia", reason: "Reason", createdAt: "2026-01-01T00:00:00Z", status: "INTERNAL_CODE" as "pending" }]} onOpenQuestion={() => {}} /></DiscussionI18nFixture>);
  expect(html).toContain("Status unavailable");
  expect(html).not.toContain("INTERNAL_CODE");
});

test("system placeholders translate without changing identical authored text", () => {
  const channel: DiscussionChannel = { id: "course", kind: "course", name: "Matematika I", courseId: "course", unreadCount: 0, muted: false, canCreate: true };
  const base: Message = { id: "m", author: { id: "a", name: "Nadia", role: "student" }, body: "Pesan dihapus.", createdAt: "2026-01-01T00:00:00Z", revision: 1, messageType: "reply", attachments: [], reactions: [], canEdit: false, canDelete: false, canReport: false };
  const noop = async () => {};
  function render(message: Message) {
    return renderToStaticMarkup(<DiscussionI18nFixture locale="en"><TooltipProvider><DiscussionMessage message={message} questionId="q" viewer={message.author} sourceChannel={channel} updateForwardDraft={() => {}} onSearchChannels={async () => ({ items: [], nextCursor: null })} onSearchForwardTargets={async () => ({ items: [], nextCursor: null })} canReply onReply={() => {}} onEdit={noop} onDelete={noop} onReact={noop} onForward={noop} onReport={noop} /></TooltipProvider></DiscussionI18nFixture>);
  }
  expect(render(base)).toContain("Pesan dihapus.");
  const system = render({ ...base, bodyKind: "deleted", replyTo: { id: "x", authorName: "Pesan dihapus", authorKind: "deleted", excerpt: "Gambar", excerptKind: "image" } });
  expect(system).toContain("Message deleted.");
  expect(system).toContain("Deleted message");
  expect(system).toContain("Image");
  expect(system).not.toContain("Pesan dihapus.");
});

test("reported-message placeholders use metadata and leave authored text intact", () => {
  const message = { body: "Pesan dihapus.", authorName: "Pesan dihapus", seq: 4, deleted: false };
  const render = (data: Parameters<typeof DiscussionReportedMessage>[0]["message"]) => renderToStaticMarkup(<DiscussionI18nFixture locale="en"><DiscussionReportedMessage message={data} /></DiscussionI18nFixture>);
  expect(render({ ...message, bodyKind: "body", authorKind: "name" })).toContain("Pesan dihapus.");
  expect(render({ ...message, bodyKind: "deleted", authorKind: "deleted", deleted: true })).toContain("Message deleted.");
  expect(render({ ...message, bodyKind: "image", authorKind: "unavailable" })).toContain("User unavailable");
  expect(render({ ...message, bodyKind: "source_unavailable" })).toContain("Original message unavailable.");
});

test("the complete fictional thread renders English controls and authored content", () => {
  const html = renderToStaticMarkup(<DiscussionI18nFixture locale="en"><DiscussionFixture query={{}} /></DiscussionI18nFixture>);
  expect(html).toContain("Discussions");
  expect(html).toContain("Question list");
  expect(html).toContain("Send answer");
  expect(html).toContain("Matematika I");
  expect(html).toContain("Mengapa limit ini perlu difaktorkan?");
});
