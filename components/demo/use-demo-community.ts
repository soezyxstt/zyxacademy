"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStudentExperience } from "@/components/student-experience-provider";
import { communityKey, demoBookingSchema, demoCommunitySchema, emptyCommunity, parseCommunity, putDemoBooking, type DemoBooking, type DemoCommunity, type DemoCommunityScope, type DemoResource } from "@/lib/demo/community-state";
import { clearDemoCommunityFiles, deleteDemoFile, readDemoFile, storeDemoFile } from "@/lib/demo/community-files";

const changeEvent = "zyx-demo-community-change";
export async function resetDemoCommunity(scope: DemoCommunityScope) {
  const key = communityKey(scope);
  localStorage.removeItem(key);
  window.dispatchEvent(new Event(changeEvent));
  await clearDemoCommunityFiles(key);
}
export type LocalScheduleOperations = {
  book: (input: { slot: any; courseId: string; groupId: string; topic: string; preSessionNotes: string; links: string[]; files: File[] }) => Promise<string>;
  update: (booking: DemoBooking, patch: Partial<DemoBooking>) => Promise<void>;
  addResource: (booking: DemoBooking, input: { phase: "pre" | "post"; kind: "file" | "link" | "recording"; label: string; url?: string; file?: File }) => Promise<{ success: true; resource: DemoResource }>;
  deleteResource: (booking: DemoBooking, resource: DemoResource) => Promise<void>;
  download: (resource: DemoResource, courseId: string) => Promise<void>;
};
export function useDemoCommunity() {
  const experience = useStudentExperience();
  const courseId = experience.selectedCourseId ?? experience.baseline[0]?.courseId ?? "";
  const revision = experience.baseline.find(row => row.courseId === courseId)?.revision ?? "";
  const key = communityKey({ courseId, revision });
  const scopeFor = useCallback((targetCourseId: string) => {
    const baseline = experience.baseline.find(row => row.courseId === targetCourseId);
    if (experience.mode !== "demo" || !baseline) throw new Error("COURSE_UNAVAILABLE");
    return { courseId: targetCourseId, revision: baseline.revision, courseTitle: experience.courses?.find(course => course.id === targetCourseId)?.title };
  }, [experience.baseline, experience.mode, experience.courses]);
  const [state, setState] = useState<DemoCommunity>(() => emptyCommunity(courseId, experience.courses?.find(course => course.id === courseId)?.title));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (experience.mode !== "demo") return;
    const read = () => {
      try { setState(parseCommunity(localStorage.getItem(key), courseId, scopeFor(courseId).courseTitle)); setError(""); }
      catch { setError("Penyimpanan browser tidak dapat dibaca. Izinkan penyimpanan lalu muat ulang."); }
      setReady(true);
    };
    read();
    window.addEventListener(changeEvent, read);
    window.addEventListener("storage", read);
    return () => { window.removeEventListener(changeEvent, read); window.removeEventListener("storage", read); };
  }, [key, experience.mode, courseId, scopeFor]);
  const save = useCallback((update: (current: DemoCommunity) => DemoCommunity, targetCourseId = courseId) => {
    try {
      const targetKey = communityKey(scopeFor(targetCourseId));
      const next = demoCommunitySchema.parse(update(parseCommunity(localStorage.getItem(targetKey), targetCourseId, scopeFor(targetCourseId).courseTitle)));
      localStorage.setItem(targetKey, JSON.stringify(next));
      if (targetKey === key) setState(next);
      setError("");
      window.dispatchEvent(new Event(changeEvent));
    } catch (cause) { setError("Perubahan belum tersimpan. Periksa data dan ruang penyimpanan browser, lalu coba lagi."); throw cause; }
  }, [key, courseId, scopeFor]);
  const operations = useMemo<LocalScheduleOperations>(() => {
    const update = async (booking: DemoBooking, patch: Partial<DemoBooking>) => save(current => {
      const existing = current.bookings.find(row => row.id === booking.id) ?? booking;
      return putDemoBooking(scopeFor(booking.courseId), current, { ...existing, ...patch });
    }, booking.courseId);
    const addResource: LocalScheduleOperations["addResource"] = async (booking, input) => {
      const fileKey = communityKey(scopeFor(booking.courseId));
      const id = crypto.randomUUID();
      const row: DemoResource = { id, phase: input.phase, kind: input.kind, label: input.label, url: input.url ?? "", fileName: input.file?.name ?? null, mimeType: input.file?.type ?? null, sizeBytes: input.file?.size ?? null, createdById: "fictional-demo-student" };
      if (input.file) await storeDemoFile(fileKey, id, input.file);
      try {
        save(current => {
          const existing = current.bookings.find(row => row.id === booking.id) ?? booking;
          return { ...current, bookings: [...current.bookings.filter(row => row.id !== booking.id), { ...existing, resources: [...existing.resources, row] }] };
        }, booking.courseId);
      } catch (cause) { if (input.file) await deleteDemoFile(fileKey, id).catch(() => undefined); throw cause; }
      return { success: true, resource: row };
    };
    return {
      update, addResource,
      async book(input) {
        if (input.slot.courseId !== input.courseId) throw new Error("COURSE_UNAVAILABLE");
        const scope = scopeFor(input.courseId);
        const fileKey = communityKey(scope);
        const booking = demoBookingSchema.parse({ id: crypto.randomUUID(), slotId: input.slot.id, sessionDate: input.slot.sessionDate, startTime: input.slot.startTime, endTime: input.slot.endTime, courseId: input.courseId, groupId: input.groupId, topic: input.topic, preSessionNotes: input.preSessionNotes, postSessionNotes: "", status: "confirmed", resources: [] });
        const stored: string[] = [];
        try {
          for (const url of input.links) booking.resources.push({ id: crypto.randomUUID(), phase: "pre", kind: "link", label: url, url, fileName: null, mimeType: null, sizeBytes: null, createdById: "fictional-demo-student" });
          for (const file of input.files) { const id = crypto.randomUUID(); await storeDemoFile(fileKey, id, file); stored.push(id); booking.resources.push({ id, phase: "pre", kind: "file", label: file.name, url: "", fileName: file.name, mimeType: file.type, sizeBytes: file.size, createdById: "fictional-demo-student" }); }
          save(current => putDemoBooking(scope, current, booking), input.courseId);
        } catch (cause) { await Promise.all(stored.map(id => deleteDemoFile(fileKey, id).catch(() => undefined))); throw cause; }
        return booking.id;
      },
      async deleteResource(booking, resource) {
        save(current => { const existing = current.bookings.find(row => row.id === booking.id) ?? booking; return { ...current, bookings: [...current.bookings.filter(row => row.id !== booking.id), { ...existing, resources: existing.resources.filter(row => row.id !== resource.id) }] }; }, booking.courseId);
        if (resource.kind === "file") await deleteDemoFile(communityKey(scopeFor(booking.courseId)), resource.id);
      },
      async download(resource, targetCourseId) {
        const file = await readDemoFile(communityKey(scopeFor(targetCourseId)), resource.id);
        if (!file) throw new Error("FILE_MISSING");
        const url = URL.createObjectURL(file); const anchor = document.createElement("a"); anchor.href = url; anchor.download = resource.fileName ?? resource.label; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
    };
  }, [save, scopeFor]);
  return { state, ready, error, save, operations, scope: { courseId, revision } };
}
