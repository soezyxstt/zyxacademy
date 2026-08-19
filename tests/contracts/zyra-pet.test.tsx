import { describe, expect, test } from "bun:test";
import { petStateForTutorEvent } from "@/lib/zyra/murid";
import { renderToStaticMarkup } from "react-dom/server";
import { ZyraCharacter } from "@/components/course/zyra-character";
import { ZyraPet } from "@/components/course/zyra-pet";

const base = { isOpen: true, activeMode: "chat", loading: false, chatLoading: false, attachmentsReady: true, hasAttachments: false, hasError: false, quotaExhausted: false };

describe("Zyra pet state", () => {
  test("maps real upload and request states", () => {
    expect(petStateForTutorEvent({ ...base, attachmentsReady: false, hasAttachments: true })).toBe("uploading");
    expect(petStateForTutorEvent({ ...base, chatLoading: true })).toBe("thinking");
  });
  test("maps quota and error before idle", () => {
    expect(petStateForTutorEvent({ ...base, quotaExhausted: true })).toBe("quota_resting");
    expect(petStateForTutorEvent({ ...base, hasError: true })).toBe("error");
  });
  test("does not animate a closed drawer", () => {
    expect(petStateForTutorEvent({ ...base, isOpen: false, chatLoading: true })).toBe("idle");
  });
  test("renders an application-owned character with a stateful face", () => {
    const success = renderToStaticMarkup(<ZyraCharacter state="success" />);
    const error = renderToStaticMarkup(<ZyraCharacter state="error" />);

    expect(success).toContain("data-zyra-character=\"true\"");
    expect(success).toContain("data-creature=\"zyra-fox\"");
    expect(success).toContain("data-tail=\"true\"");
    expect(success).toContain("data-paws=\"true\"");
    expect(success).toContain("data-state=\"success\"");
    expect(success).toContain("data-expression=\"happy\"");
    expect(success).toContain("data-glyph=\"success\"");
    expect(error).toContain("data-expression=\"worried\"");
    expect(error).toContain("data-glyph=\"error\"");
  });

  test("keeps the character state accessible through the pet label", () => {
    const markup = renderToStaticMarkup(<ZyraPet state="thinking" />);

    expect(markup).toContain("aria-label=\"Zyra sedang berpikir\"");
    expect(markup).toContain("data-state=\"thinking\"");
    expect(markup).toContain("data-expression=\"focused\"");
    expect(markup).toContain("data-glyph=\"thinking\"");
  });
});
