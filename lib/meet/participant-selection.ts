type Participant = { email: string; name: string; roles: string[]; courseIds: string[] };

export function filterMeetParticipants<T extends Participant>(people: T[], query: string, role: string, course: string): T[] {
  const term = query.trim().toLowerCase();
  return people.filter(person => (role === "all" || person.roles.includes(role))
    && (course === "all" || person.courseIds.includes(course))
    && (!term || person.email.toLowerCase().includes(term) || person.name.toLowerCase().includes(term)));
}

export function toggleMeetParticipants(selected: string[], matching: string[]) {
  if (!matching.length) return selected;
  const emails = new Set(selected);
  const remove = matching.every(email => emails.has(email));
  for (const email of matching) {
    if (remove) emails.delete(email);
    else emails.add(email);
  }
  return [...emails];
}
