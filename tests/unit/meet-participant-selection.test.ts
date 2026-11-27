import { expect, test } from "bun:test";
import { filterMeetParticipants, toggleMeetParticipants } from "../../lib/meet/participant-selection";

const people = [
  { name: "Dina", email: "dina@example.test", courseIds: ["fisika"], roles: ["murid"] },
  { name: "Tutor A", email: "a@example.test", courseIds: ["fisika"], roles: ["tutor", "admin"] },
  { name: "Tutor B", email: "b@example.test", courseIds: ["kimia"], roles: ["tutor"] },
];
test("search, course and canonical role narrow the same invite directory on web and mobile", () => {
  expect(filterMeetParticipants(people, " DI ", "murid", "fisika")).toEqual([people[0]]);
  expect(filterMeetParticipants(people, "example.test", "tutor", "fisika")).toEqual([people[1]]);
});
test("bulk selection preserves people outside the filter and deduplicates multiple roles", () => {
  const [one, two, three] = people.map(person => person.email);
  expect(toggleMeetParticipants([one, two], [two, three, three])).toEqual([one, two, three]);
  expect(toggleMeetParticipants([one, two, three], [two, three])).toEqual([one]);
  expect(toggleMeetParticipants([one], [])).toEqual([one]);
});
