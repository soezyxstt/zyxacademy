import { expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DiscussionI18nFixture } from "./discussion-i18n-fixture";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { DiscussionChannel, DiscussionForwardDraft, DiscussionMessage as Message } from "@/components/discussions/view-model";

mock.module("@/lib/i18n/actions", () => ({ saveLocaleSelection: async () => ({ success: true }), mirrorResolvedAccountLocaleCookie: async () => {} }));
mock.module("@/components/ui/formatted-date", () => ({ FormattedDate: () => <span>15 Nov</span> }));
const { DiscussionChannelPicker, DiscussionMessage, deliverDiscussionForward } = await import("@/components/discussions/discussion-message");

const channel: DiscussionChannel = { id: "math", name: "Matematika I", kind: "course", courseId: "math", unreadCount: 0, muted: false, canCreate: true };

test("forward recovery retries the immutable destination and request after a remount", async () => {
  let draft: DiscussionForwardDraft | undefined = { targetChannel: channel, targetQuestion: "destination", targetTitle: "Title", requestId: "request", status: "ready" };
  const update = (change: (current: DiscussionForwardDraft | undefined) => DiscussionForwardDraft | undefined) => { draft = change(draft); };
  const attempts: unknown[] = [];
  const send = async (input: unknown) => { attempts.push(input); if (attempts.length === 1) throw new Error("lost response"); };
  await deliverDiscussionForward(draft, { questionId: "source", messageId: "message" }, update, send);
  expect(draft).toMatchObject({ status: "unknown", requestId: "request", targetQuestion: "destination" });
  const restored = { ...draft! };
  await deliverDiscussionForward(restored, { questionId: "source", messageId: "message" }, update, send);
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  expect(draft).toBeUndefined();
});

test("resolved retry explains the destination while preserving uncertain identity", async () => {
 let draft: DiscussionForwardDraft | undefined = { targetChannel: channel, targetQuestion: "destination", targetTitle: "Title", requestId: "same-request", status: "unknown" };
 await deliverDiscussionForward(draft, { questionId: "source", messageId: "message" }, change => { draft = change(draft); }, async () => "resolved");
 expect(draft).toMatchObject({ status: "unknown", requestId: "same-request", error: "resolved" });
});

test("legacy forward recovery remains locked and stale callbacks cannot replace a newer draft", async () => {
  let draft: DiscussionForwardDraft | undefined = { targetChannel: channel, targetQuestion: "destination", targetTitle: "Title", requestId: "old", status: "unknown" };
  const update = (change: (current: DiscussionForwardDraft | undefined) => DiscussionForwardDraft | undefined) => { draft = change(draft); };
  let finish!: (value: { error: "replay_unverified"; target: { threadId: string; messageId: string } }) => void;
  const pending = deliverDiscussionForward(draft, { questionId: "source", messageId: "message" }, update, () => new Promise(resolve => { finish = resolve; }));
  expect(draft?.status).toBe("sending");
  draft = { targetChannel: channel, targetQuestion: "other", targetTitle: "Other", requestId: "new", status: "ready" };
  finish({ error: "replay_unverified", target: { threadId: "destination", messageId: "existing" } });
  await pending;
  expect(draft).toMatchObject({ requestId: "new", targetQuestion: "other", status: "ready" });
  draft = { ...draft, requestId: "old", targetQuestion: "destination", status: "unknown" };
  await deliverDiscussionForward(draft, { questionId: "source", messageId: "message" }, update, async () => ({ error: "replay_unverified", target: { threadId: "destination", messageId: "existing" } }));
  expect(draft).toMatchObject({ requestId: "old", targetQuestion: "destination", status: "replay_unverified", replayTarget: { threadId: "destination", messageId: "existing" } });
  let retried = false;
  await deliverDiscussionForward(draft!, { questionId: "source", messageId: "message" }, update, async () => { retried = true; });
  expect(retried).toBe(false);
});

test("renders a labelled searchable channel picker", () => {
  const html = renderToStaticMarkup(<DiscussionI18nFixture><TooltipProvider><DiscussionChannelPicker value={channel} label="Kanal tujuan" placeholder="Pilih kanal" onChange={() => {}} onSearch={async () => ({ items: [], nextCursor: null })} /></TooltipProvider></DiscussionI18nFixture>);
  expect(html).toContain('aria-label="Kanal tujuan"');
  expect(html).toContain("Matematika I");
});

test("renders an off-page quote", () => {
  const message: Message = { id: "reply", author: { id: "author", name: "Nadia", role: "student" }, body: "Terima kasih", createdAt: "2026-01-01T00:00:00Z", revision: 1, messageType: "reply", replyTo: { id: "old", authorName: "Zyra", excerpt: "Pesan sebelumnya" }, attachments: [], reactions: [], canEdit: false, canDelete: false, canReport: false };
  const noop = async () => {};
  const html = renderToStaticMarkup(<DiscussionI18nFixture><TooltipProvider><DiscussionMessage message={message} questionId="thread" viewer={message.author} sourceChannel={channel} updateForwardDraft={() => {}} onSearchChannels={async () => ({ items: [], nextCursor: null })} onSearchForwardTargets={async () => ({ items: [], nextCursor: null })} canReply onReply={() => {}} onEdit={noop} onDelete={noop} onReact={noop} onForward={noop} onReport={noop} /></TooltipProvider></DiscussionI18nFixture>);
  expect(html).toContain("Zyra");
  expect(html).toContain("Pesan sebelumnya");
});

test("deleted messages expose no unusable actions", () => {
  const message: Message = { id: "deleted", author: { id: "author", name: "Nadia", role: "student" }, body: "Pesan dihapus.", bodyKind: "deleted", createdAt: "2026-01-01T00:00:00Z", revision: 2, messageType: "answer", attachments: [], reactions: [], canEdit: false, canDelete: false, canReport: false, canReply: false, canForward: false, canReact: false };
  const noop = async () => {};
  const html = renderToStaticMarkup(<DiscussionI18nFixture><TooltipProvider><DiscussionMessage message={message} questionId="thread" viewer={message.author} sourceChannel={channel} updateForwardDraft={() => {}} onSearchChannels={async () => ({ items: [], nextCursor: null })} onSearchForwardTargets={async () => ({ items: [], nextCursor: null })} canReply onReply={() => {}} onEdit={noop} onDelete={noop} onReact={noop} onForward={noop} onReport={noop} onViewProfile={() => {}} /></TooltipProvider></DiscussionI18nFixture>);
  expect(html).toContain("Pesan dihapus.");
  expect(html).not.toContain('aria-label="Tindakan pesan');
  expect(html).not.toContain('aria-label="Tambah reaksi');
  expect(html).not.toContain('aria-label="Lihat profil');
});

test("reaction controls identify repeated messages from the same author", () => {
 const noop = async () => {};
 const render = (seq: number) => {
  const message: Message = { id: `message-${seq}`, seq, author: { id: "author", name: "Nadia", role: "student" }, body: `Langkah ${seq}`, createdAt: "2026-01-01T00:00:00Z", revision: 1, messageType: "answer", attachments: [], reactions: [{ emoji: "👍", count: 1, selected: false }], canEdit: false, canDelete: false, canReport: false, canReact: true };
  return renderToStaticMarkup(<DiscussionI18nFixture locale="en"><TooltipProvider><DiscussionMessage message={message} questionId="thread" viewer={message.author} sourceChannel={channel} updateForwardDraft={() => {}} onSearchChannels={async () => ({ items: [], nextCursor: null })} onSearchForwardTargets={async () => ({ items: [], nextCursor: null })} canReply onReply={() => {}} onEdit={noop} onDelete={noop} onReact={noop} onForward={noop} onReport={noop} /></TooltipProvider></DiscussionI18nFixture>);
 };
 const labels = [render(2), render(3)].map(html => [...html.matchAll(/aria-label="([^"]+)"/g)].map(match => match[1]));
 for (let n = 0; n < 2; n++) {
  expect(labels[n].find(label => label.startsWith("Add reaction."))).toContain(`Message ${n + 2} from Nadia: Langkah ${n + 2}`);
  expect(labels[n].find(label => label.startsWith("Reaction "))).toContain(`Message ${n + 2} from Nadia: Langkah ${n + 2}`);
 }
});

test("distinguishes own chat bubbles from others and renders profile triggers for human authors", () => {
  const noop = async () => {};
  const viewer = { id: "nadia", name: "Nadia Putri", role: "student" as const };
  const other = { id: "raka", name: "Raka Pratama", role: "tutor" as const };
  const zyra = { id: "zyra", name: "Zyra", role: "zyra" as const };

  const ownHtml = renderToStaticMarkup(
    <DiscussionI18nFixture>
      <TooltipProvider>
        <DiscussionMessage
          message={{ id: "m-own", author: viewer, body: "Pertanyaan saya", createdAt: "2026-01-01T00:00:00Z", revision: 1, messageType: "question", attachments: [], reactions: [], canEdit: false, canDelete: false, canReport: false }}
          questionId="thread"
          viewer={viewer}
          sourceChannel={channel}
          updateForwardDraft={() => {}}
          onSearchChannels={async () => ({ items: [], nextCursor: null })}
          onSearchForwardTargets={async () => ({ items: [], nextCursor: null })}
          canReply
          onReply={() => {}}
          onEdit={noop}
          onDelete={noop}
          onReact={noop}
          onForward={noop}
          onReport={noop}
          onViewProfile={() => {}}
        />
      </TooltipProvider>
    </DiscussionI18nFixture>
  );
  expect(ownHtml).toContain('data-own-message="true"');
  expect(ownHtml).toContain("flex-row-reverse");
  expect(ownHtml).toContain("bg-[color-mix(in_oklab,var(--primary)_10%,var(--background))]");
  expect(ownHtml).toContain("border-primary/25");
  expect(ownHtml).toContain('aria-label="Lihat profil Nadia Putri"');

  const otherHtml = renderToStaticMarkup(
    <DiscussionI18nFixture locale="en">
      <TooltipProvider>
        <DiscussionMessage
          message={{ id: "m-other", author: other, body: "Penjelasan tutor", createdAt: "2026-01-01T00:00:00Z", revision: 1, messageType: "answer", attachments: [], reactions: [], canEdit: false, canDelete: false, canReport: false }}
          questionId="thread"
          viewer={viewer}
          sourceChannel={channel}
          updateForwardDraft={() => {}}
          onSearchChannels={async () => ({ items: [], nextCursor: null })}
          onSearchForwardTargets={async () => ({ items: [], nextCursor: null })}
          canReply
          onReply={() => {}}
          onEdit={noop}
          onDelete={noop}
          onReact={noop}
          onForward={noop}
          onReport={noop}
          onViewProfile={() => {}}
        />
      </TooltipProvider>
    </DiscussionI18nFixture>
  );
  expect(otherHtml).not.toContain('data-own-message="true"');
  expect(otherHtml).not.toContain("flex-row-reverse");
  expect(otherHtml).toContain("border-border bg-card");
  expect(otherHtml).toContain("View Raka Pratama&#x27;s profile");

  const zyraHtml = renderToStaticMarkup(
    <DiscussionI18nFixture>
      <TooltipProvider>
        <DiscussionMessage
          message={{ id: "m-zyra", author: zyra, body: "Penjelasan Zyra", createdAt: "2026-01-01T00:00:00Z", revision: 1, messageType: "answer", attachments: [], reactions: [], canEdit: false, canDelete: false, canReport: false }}
          questionId="thread"
          viewer={viewer}
          sourceChannel={channel}
          updateForwardDraft={() => {}}
          onSearchChannels={async () => ({ items: [], nextCursor: null })}
          onSearchForwardTargets={async () => ({ items: [], nextCursor: null })}
          canReply
          onReply={() => {}}
          onEdit={noop}
          onDelete={noop}
          onReact={noop}
          onForward={noop}
          onReport={noop}
          onViewProfile={() => {}}
        />
      </TooltipProvider>
    </DiscussionI18nFixture>
  );
  expect(zyraHtml).not.toContain('data-own-message="true"');
  expect(zyraHtml).not.toContain('aria-label="Lihat profil');
});
