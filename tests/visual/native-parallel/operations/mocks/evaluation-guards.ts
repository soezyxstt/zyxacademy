export async function assertAdmin() {
  return { user: { id: "evaluation-alias-admin" } };
}

export const assertTutorOrAdmin = assertAdmin;
