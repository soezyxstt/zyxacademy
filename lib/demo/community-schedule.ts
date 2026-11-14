import { communityKey, demoWeek, parseCommunity, type DemoCommunityScope } from "./community-state";
import { demoCommunitySeed, demoGroupId } from "./community-seed";

/** One scoped store per course, one combined calendar for the student dashboard. */
export function demoCommunitySchedule(scopes: readonly DemoCommunityScope[], courses: readonly { id: string; title: string }[], anchor: string, read: (key: string) => string | null) {
  const weeks = scopes.map(scope => {
    const course = courses.find(row => row.id === scope.courseId);
    const state = parseCommunity(read(communityKey(scope)), scope.courseId, course?.title);
    const week = demoWeek({ ...scope, courseTitle: course?.title }, anchor, state);
    const group = { id: demoGroupId(scope.courseId), ...state.group, totalQuotaSessions: 9999, usedQuotaSessions: 0, courses: [{ course }] };
    return { group,
      slots: week.slots.map(slot => ({ ...slot, tutor: { ...slot.tutor, tutorCourses: [{ courseId: scope.courseId }] } })),
      bookings: week.bookings.map(row => ({ ...row, course, group, mode: "online", slot: { tutorId: `fictional-demo-tutor-${encodeURIComponent(scope.courseId)}`, tutor: { name: demoCommunitySeed(scope.courseId, course?.title).tutor } } })),
    };
  });
  return { groups: weeks.map(week => week.group), availableSlots: weeks.flatMap(week => week.slots), groupBookings: weeks.flatMap(week => week.bookings) };
}
