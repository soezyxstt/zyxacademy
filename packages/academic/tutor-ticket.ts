export type TutorTicketCommand =
  | { action: "decide"; decision: "approved" | "rejected"; notes: string }
  | { action: "reply"; message: string };

export type TutorTicketAttempt = { requestId: string; command: TutorTicketCommand };
export type TutorTicketEditor = {
  pending(id: string): TutorTicketAttempt | undefined;
  submit(id: string, draft: TutorTicketAttempt, signal: AbortSignal): Promise<"saved" | "denied" | "missing" | "invalid" | "conflict" | "unknown">;
};
