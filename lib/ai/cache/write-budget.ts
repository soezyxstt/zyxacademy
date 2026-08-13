export const ZYRA_CACHE_DAILY_WRITE_LIMIT = 900 as const;

export class DailyCacheWriteBudget {
  private readonly claimed = new Map<string, number>();

  claim(day: string, slots = 1): { readonly accepted: boolean; readonly claimed: number; readonly remaining: number } {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(slots) || slots < 1) {
      throw new Error("invalid cache write budget claim");
    }
    const current = this.claimed.get(day) ?? 0;
    const next = current + slots;
    if (next > ZYRA_CACHE_DAILY_WRITE_LIMIT) {
      return { accepted: false, claimed: current, remaining: ZYRA_CACHE_DAILY_WRITE_LIMIT - current };
    }
    this.claimed.set(day, next);
    return { accepted: true, claimed: next, remaining: ZYRA_CACHE_DAILY_WRITE_LIMIT - next };
  }

  count(day: string): number {
    return this.claimed.get(day) ?? 0;
  }
}
