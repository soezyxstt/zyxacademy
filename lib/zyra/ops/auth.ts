export function canViewZyraOps(role: string | null | undefined): boolean {
  return role === "admin";
}

export function canViewPersonalZyraUsage(input: { actorId: string | null | undefined; ownerId: string; role?: string | null }): boolean {
  return Boolean(input.actorId) && (input.actorId === input.ownerId || input.role === "admin");
}
