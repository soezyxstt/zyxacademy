import { TutorDataError } from "./model";

export type TutorSlotDraft = {
  id?: string;
  date: string;
  time: string;
  mode: "online" | "offline";
  topic: string;
  location: string;
};

type TutorSlot = TutorSlotDraft & { id: string; booked: boolean };
type DiscussionReply = { id: string; body: string };
type LiveState = { phase: "setup" | "lobby" | "question" | "result"; currentQuestion: number };
type LiveAction = "open" | "start" | "next" | "close";

type TutorFixtureSnapshot = {
  slots: readonly TutorSlot[];
  discussionReplies: readonly DiscussionReply[];
  live: LiveState;
};

type SlotResult = { ok: true } | { ok: false; reason: "invalid" | "unavailable" | "conflict" };

export type TutorFixtureRepository = {
  getSnapshot(): TutorFixtureSnapshot;
  subscribe(listener: () => void): () => void;
  saveSlot(draft: TutorSlotDraft): SlotResult;
  replyToDiscussion(courseId: string | undefined, body: string): boolean;
  updateLive(courseId: string, action: LiveAction): void;
};

export const tutorFixtureWeek = "2026-11-23";
export const tutorLiveQuestions = [
  "Organel manakah yang berperan dalam respirasi sel?",
  "Apa perbedaan difusi dan osmosis?",
];

const sampleSlot: TutorSlot = {
  id: "academic-slot-1",
  date: "2026-11-28",
  time: "09:00",
  mode: "online",
  topic: "Struktur dan fungsi sel",
  location: "",
  booked: true,
};

export function addTutorDays(date: string, days: number) {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function slotEndTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const end = hours * 60 + minutes + 90;
  return `${Math.floor(end / 60).toString().padStart(2, "0")}:${(end % 60).toString().padStart(2, "0")}`;
}

export function createTutorFixtureRepository(
  populated: boolean,
  authorize: () => void,
  hasPopulatedCourse: (courseId?: string) => boolean,
): TutorFixtureRepository {
  let snapshot: TutorFixtureSnapshot = {
    slots: populated ? [sampleSlot] : [],
    discussionReplies: [],
    live: { phase: "setup", currentQuestion: 0 },
  };
  const listeners = new Set<() => void>();
  let nextSlot = 2;
  let nextReply = 1;

  function update(data: Partial<TutorFixtureSnapshot>) {
    snapshot = { ...snapshot, ...data };
    for (const listener of listeners) listener();
  }

  return {
    getSnapshot() {
      authorize();
      return snapshot;
    },
    subscribe(listener) {
      authorize();
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    saveSlot(draft) {
      authorize();
      const parsed = new Date(`${draft.date}T00:00:00Z`);
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(draft.date) &&
        !Number.isNaN(parsed.valueOf()) &&
        parsed.toISOString().slice(0, 10) === draft.date &&
        draft.date >= addTutorDays(tutorFixtureWeek, -520 * 7) &&
        draft.date <= addTutorDays(tutorFixtureWeek, 520 * 7 + 6);
      const validTime = /^(?:[01]\d|2[0-2]):[0-5]\d$/.test(draft.time) && slotEndTime(draft.time) <= "23:59";
      if (!validDate || !validTime || !["online", "offline"].includes(draft.mode) ||
          (draft.mode === "offline" && !draft.location.trim())) return { ok: false, reason: "invalid" };
      const current = draft.id ? snapshot.slots.find((slot) => slot.id === draft.id) : undefined;
      if (draft.id && (!current || current.booked)) return { ok: false, reason: "unavailable" };
      if (snapshot.slots.some((slot) => slot.id !== draft.id && slot.date === draft.date &&
          slot.time < slotEndTime(draft.time) && slotEndTime(slot.time) > draft.time)) {
        return { ok: false, reason: "conflict" };
      }
      const id = current?.id ?? `academic-slot-${nextSlot++}`;
      const slot = { ...draft, id, booked: false };
      update({ slots: [...snapshot.slots.filter((item) => item.id !== id), slot] });
      return { ok: true };
    },
    replyToDiscussion(courseId, message) {
      authorize();
      if (!hasPopulatedCourse(courseId)) throw new TutorDataError(404);
      const body = message.trim();
      if (!body) return false;
      update({ discussionReplies: [...snapshot.discussionReplies, { id: `academic-reply-${nextReply++}`, body }] });
      return true;
    },
    updateLive(courseId, action) {
      authorize();
      if (!hasPopulatedCourse(courseId)) throw new TutorDataError(404);
      const { phase, currentQuestion } = snapshot.live;
      if (action === "open" && phase === "setup") {
        update({ live: { phase: "lobby", currentQuestion: 0 } });
      } else if (action === "start" && phase === "lobby") {
        update({ live: { phase: "question", currentQuestion: 0 } });
      } else if (action === "next" && phase === "question") {
        const next = currentQuestion + 1;
        update({ live: next < tutorLiveQuestions.length ? { phase, currentQuestion: next } : { phase: "result", currentQuestion } });
      } else if (action === "close" && (phase === "lobby" || phase === "result")) {
        update({ live: { phase: "setup", currentQuestion: 0 } });
      }
    },
  };
}
