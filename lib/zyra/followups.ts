/** Hidden, optional metadata appended to an answer by the same generation. */
export const FOLLOWUPS_OPEN = '<zyra-followups>';
export const FOLLOWUPS_CLOSE = '</zyra-followups>';
export const FOLLOWUPS_GUIDANCE = `Optionally append a final ${FOLLOWUPS_OPEN} JSON array ${FOLLOWUPS_CLOSE} to the answer. Offer at most three distinct, context-specific next learning steps in the response language. Each object has short label, prompt, icon (example, help, compass, refresh, arrow), and intent (hint, explain, practice, check). Do not suggest revealing a full answer or bypassing assessment restrictions. Omit the block if no useful safe step exists.`;

export type Followup = { label: string; prompt: string; icon: 'example' | 'help' | 'compass' | 'refresh' | 'arrow'; intent: 'hint' | 'explain' | 'practice' | 'check' };
const icons = new Set(['example', 'help', 'compass', 'refresh', 'arrow']);
const intents = new Set(['hint', 'explain', 'practice', 'check']);

export function validateFollowups(value: unknown): Followup[] {
  if (!Array.isArray(value) || value.length > 3) return [];
  const result: Followup[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const v = item as Record<string, unknown>;
    if (Object.keys(v).some(key => !['label', 'prompt', 'icon', 'intent'].includes(key)) ||
      typeof v.label !== 'string' || typeof v.prompt !== 'string' ||
      !v.label.trim() || v.label.length > 48 || !v.prompt.trim() || v.prompt.length > 240 ||
      /[\u0000-\u001f\u007f<>]/.test(v.label + v.prompt) ||
      typeof v.icon !== 'string' || !icons.has(v.icon) || typeof v.intent !== 'string' || !intents.has(v.intent)) return [];
    result.push({ label: v.label.trim(), prompt: v.prompt.trim(), icon: v.icon as Followup['icon'], intent: v.intent as Followup['intent'] });
  }
  return result;
}

/** Buffers a possible delimiter prefix and suppresses all metadata, including truncated blocks. */
export class FollowupParser {
  private pending = '';
  private metadata = '';
  private hidden = false;
  private overflow = false;
  push(chunk: string): string {
    if (this.hidden) { this.collect(chunk); return ''; }
    this.pending += chunk;
    const start = this.pending.indexOf(FOLLOWUPS_OPEN);
    if (start >= 0) {
      const visible = this.pending.slice(0, start);
      this.hidden = true;
      this.collect(this.pending.slice(start + FOLLOWUPS_OPEN.length));
      this.pending = '';
      return visible;
    }
    let keep = Math.min(this.pending.length, FOLLOWUPS_OPEN.length - 1);
    while (keep && !FOLLOWUPS_OPEN.startsWith(this.pending.slice(-keep))) keep--;
    const visible = this.pending.slice(0, this.pending.length - keep);
    this.pending = this.pending.slice(this.pending.length - keep);
    return visible;
  }
  private collect(chunk: string) {
    if (this.metadata.length + chunk.length > 4096) { this.overflow = true; this.metadata = ''; }
    else if (!this.overflow) this.metadata += chunk;
  }
  finish(): { text: string; followups: Followup[] } {
    if (!this.hidden) return { text: this.pending.length < 2 ? this.pending : '', followups: [] };
    const end = this.metadata.indexOf(FOLLOWUPS_CLOSE);
    if (this.overflow || end < 0 || this.metadata.slice(end + FOLLOWUPS_CLOSE.length).trim()) return { text: '', followups: [] };
    try { return { text: '', followups: validateFollowups(JSON.parse(this.metadata.slice(0, end))) }; }
    catch { return { text: '', followups: [] }; }
  }
}

/** Normalize a completed answer before persistence or streaming. */
export function parseFollowupAnswer(answer: string): { text: string; followups: Followup[] } {
  const parser = new FollowupParser();
  const visible = parser.push(answer);
  const result = parser.finish();
  return { text: visible + result.text, followups: result.followups };
}

export function followupEvent(value: unknown): { type: 'data-followups'; followups: Followup[] } | null {
  const followups = validateFollowups(value);
  return followups.length ? { type: 'data-followups', followups } : null;
}
