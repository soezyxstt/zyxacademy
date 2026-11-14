type CourseLink = { courseId?: string | null; course?: { id?: string | null } | null };
type StudentSchedule = {
  availableSlots?: Array<{ matchedCourseIds?: readonly string[]; tutor?: { tutorCourses?: CourseLink[] } | null }>;
  groupBookings?: CourseLink[];
  academicSchedules?: CourseLink[];
  enrollments?: CourseLink[];
  groups?: Array<{ courses?: CourseLink[] }>;
};

export function scopeStudentSchedule<T extends StudentSchedule>(data: T, courseIds: readonly string[]) {
  if (!courseIds.length) return data;
  const matches = (row: CourseLink) => courseIds.includes(row.courseId ?? row.course?.id ?? "");
  return {
    ...data,
    availableSlots: (data.availableSlots ?? []).filter((slot) => slot.matchedCourseIds
      ? slot.matchedCourseIds.some((id) => courseIds.includes(id))
      : slot.tutor?.tutorCourses?.some(matches)),
    groupBookings: (data.groupBookings ?? []).filter(matches),
    academicSchedules: (data.academicSchedules ?? []).filter(matches),
    enrollments: (data.enrollments ?? []).filter(matches),
    groups: (data.groups ?? []).flatMap((group) => {
      const courses = (group.courses ?? []).filter(matches);
      return courses.length ? [{ ...group, courses }] : [];
    }),
  };
}
