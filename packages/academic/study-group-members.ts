export type StudyGroupPerson = { id: string; name: string; email: string };
export type StudyGroupMember = StudyGroupPerson & { membershipId: string; role: "leader" | "member" };
export type StudyGroupMembersRead = {
  id: string; name: string; revision: string; canAdd: boolean; members: StudyGroupMember[];
  candidates: StudyGroupPerson[]; nextPage: boolean; recoveryTarget?: StudyGroupPerson;
};
export type StudyGroupMemberEdit = { accountId: string; userId: string; action: "add" | "remove"; expectedRevision: string };
export type StudyGroupMemberRecovery = Omit<StudyGroupMemberEdit, "accountId"> & { requestId: string };

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function person(value: unknown): value is StudyGroupPerson {
  return object(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.email === "string";
}

function member(value: unknown): value is StudyGroupMember {
  return person(value) && "membershipId" in value && typeof value.membershipId === "string"
    && "role" in value && (value.role === "leader" || value.role === "member");
}

export function isStudyGroupMembersRead(value: unknown): value is StudyGroupMembersRead {
  return object(value) && typeof value.id === "string" && typeof value.name === "string"
    && typeof value.revision === "string" && /^[a-f0-9]{64}$/.test(value.revision)
    && typeof value.canAdd === "boolean" && typeof value.nextPage === "boolean"
    && Array.isArray(value.members) && value.members.every(member)
    && Array.isArray(value.candidates) && value.candidates.every(person)
    && (value.recoveryTarget === undefined || person(value.recoveryTarget));
}
