export function useSession() {
  return { data: null, isPending: false, error: null };
}

export async function signOut() {}

export const signIn = {
  async social() { return { error: { message: "Sign-in is disabled in this reference fixture." } }; },
};

export const authClient = {
  async getSession() { return { data: null, error: null }; },
  async $fetch() { return { data: null, error: { message: "Account actions are disabled in this reference fixture." } }; },
};
