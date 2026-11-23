import { FollowupParser } from "@/lib/zyra/followups";

/**
 * Incrementally extracts and decodes a top-level JSON string field (such as
 * `learnerFacingText` or `answer`) from a streamed LLM JSON response, while
 * suppressing hidden `<zyra-followups>...</zyra-followups>` metadata.
 */
export class JsonFieldStreamExtractor {
  private readonly targetKeys: ReadonlySet<string>;
  private readonly onDelta: (text: string) => void;
  private readonly followupParser = new FollowupParser();

  private objectDepth = 0;
  private arrayDepth = 0;
  private inString = false;
  private escapeNext = false;
  private unicodeBuf: string | null = null;

  private readingKey = false;
  private keyBuf = "";
  private awaitingColon = false;
  private awaitingValue = false;
  private matchedTargetKey = false;
  private capturingTarget = false;
  private emittedAny = false;
  private finishedTarget = false;
  private totalEmitted = "";

  private pendingEmit = "";

  constructor(
    targetKeys: readonly string[],
    onDelta: (text: string) => void,
  ) {
    this.targetKeys = new Set(targetKeys);
    this.onDelta = onDelta;
  }

  get hasEmitted(): boolean {
    return this.emittedAny;
  }

  get emittedText(): string {
    return this.totalEmitted;
  }

  /** Reset parser state between sequential provider calls when no answer text has been emitted yet. */
  reset(): void {
    if (this.emittedAny) return;
    this.objectDepth = 0;
    this.arrayDepth = 0;
    this.inString = false;
    this.escapeNext = false;
    this.unicodeBuf = null;
    this.readingKey = false;
    this.keyBuf = "";
    this.awaitingColon = false;
    this.awaitingValue = false;
    this.matchedTargetKey = false;
    this.capturingTarget = false;
    this.finishedTarget = false;
    this.pendingEmit = "";
  }

  private emitDecoded(decoded: string): void {
    if (!decoded) return;
    const visible = this.followupParser.push(decoded);
    if (visible) {
      this.pendingEmit += visible;
    }
  }

  private flushPending(): void {
    if (!this.pendingEmit) return;
    const batch = this.pendingEmit;
    this.pendingEmit = "";
    this.emittedAny = true;
    this.totalEmitted += batch;
    this.onDelta(batch);
  }

  private finishTargetString(): void {
    this.capturingTarget = false;
    this.finishedTarget = true;
    const tail = this.followupParser.finish().text;
    if (tail) {
      this.pendingEmit += tail;
    }
    this.flushPending();
  }

  push(chunk: string): void {
    if (!chunk || this.finishedTarget) return;

    for (let i = 0; i < chunk.length; i++) {
      if (this.finishedTarget) break;
      const ch = chunk[i];

      if (this.inString) {
        if (this.unicodeBuf !== null) {
          this.unicodeBuf += ch;
          if (this.unicodeBuf.length === 4) {
            const code = Number.parseInt(this.unicodeBuf, 16);
            this.unicodeBuf = null;
            const decoded = Number.isNaN(code) ? "" : String.fromCharCode(code);
            if (this.capturingTarget) this.emitDecoded(decoded);
            else if (this.readingKey) this.keyBuf += decoded;
          }
          continue;
        }

        if (this.escapeNext) {
          this.escapeNext = false;
          if (ch === "u") {
            this.unicodeBuf = "";
            continue;
          }
          let decoded = ch;
          if (ch === "n") decoded = "\n";
          else if (ch === "r") decoded = "\r";
          else if (ch === "t") decoded = "\t";
          else if (ch === "b") decoded = "\b";
          else if (ch === "f") decoded = "\f";
          else if (ch === '"' || ch === "\\" || ch === "/") decoded = ch;

          if (this.capturingTarget) this.emitDecoded(decoded);
          else if (this.readingKey) this.keyBuf += decoded;
          continue;
        }

        if (ch === "\\") {
          this.escapeNext = true;
          continue;
        }

        if (ch === '"') {
          this.inString = false;
          if (this.capturingTarget) {
            this.finishTargetString();
          } else if (this.readingKey) {
            this.readingKey = false;
            this.matchedTargetKey = this.targetKeys.has(this.keyBuf);
            this.keyBuf = "";
            this.awaitingColon = true;
          }
          continue;
        }

        if (this.capturingTarget) {
          this.emitDecoded(ch);
        } else if (this.readingKey) {
          this.keyBuf += ch;
        }
        continue;
      }

      // Outside string
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
        continue;
      }

      if (ch === '"') {
        this.inString = true;
        if (this.objectDepth === 1 && this.arrayDepth === 0) {
          if (this.awaitingValue) {
            this.awaitingValue = false;
            if (this.matchedTargetKey) {
              this.capturingTarget = true;
            }
            this.matchedTargetKey = false;
          } else if (!this.awaitingColon) {
            this.readingKey = true;
            this.keyBuf = "";
          }
        }
        continue;
      }

      if (this.objectDepth === 1 && this.arrayDepth === 0) {
        if (this.awaitingColon && ch === ":") {
          this.awaitingColon = false;
          this.awaitingValue = true;
          continue;
        }
        if (this.awaitingValue) {
          // Non-string value for this key
          this.awaitingValue = false;
          this.matchedTargetKey = false;
        }
      }

      if (ch === "{") {
        this.objectDepth += 1;
      } else if (ch === "}") {
        if (this.objectDepth > 0) this.objectDepth -= 1;
      } else if (ch === "[") {
        this.arrayDepth += 1;
      } else if (ch === "]") {
        if (this.arrayDepth > 0) this.arrayDepth -= 1;
      } else if (ch === "," && this.objectDepth === 1 && this.arrayDepth === 0) {
        this.awaitingColon = false;
        this.awaitingValue = false;
        this.matchedTargetKey = false;
      }
    }

    this.flushPending();
  }
}
