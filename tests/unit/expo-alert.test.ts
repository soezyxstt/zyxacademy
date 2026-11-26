import { expect, test } from "bun:test";
import { alertAnnouncement, nativeAlertPresentation } from "../../apps/mobile-native/components/alert-model";
import { nativeColors } from "../../packages/design-tokens/native-colors";
import { alertCases, alertPosition } from "../../packages/ui-parity/alert-cases";
import { parityFrame } from "../../packages/ui-parity/frame";
import { galleryCases } from "../../packages/ui-parity/gallery";

test("registers three actual alert shapes with room for the icon and both text rows", () => {
  expect(galleryCases.filter(item => item.component === "alert").map(item => item.id)).toEqual(alertCases.map(item => item.id));
  expect(alertCases.map(item => [item.theme, item.variant, "icon" in item])).toEqual([
    ["light", "default", false],
    ["dark", "default", true],
    ["light", "destructive", true],
  ]);
  expect(alertPosition.left * 2 + alertPosition.width).toBe(parityFrame.width);
  expect(alertCases[2].action.href).toBe("/admin/jobs");
});

test("uses card tokens in both themes and makes destructive announcements assertive", () => {
  for (const theme of ["light", "dark"] as const) {
    const tokens = nativeColors[theme];
    expect(nativeAlertPresentation("default", theme)).toEqual({
      color: tokens.cardForeground,
      borderColor: tokens.border,
      backgroundColor: tokens.card,
      liveRegion: "polite",
    });
    expect(nativeAlertPresentation("destructive", theme)).toEqual({
      color: tokens.destructive,
      borderColor: tokens.destructive + "4d",
      backgroundColor: tokens.destructive + "0d",
      liveRegion: "assertive",
    });
  }
  expect(alertAnnouncement("Unduhan siap")).toBe("Unduhan siap");
  expect(alertAnnouncement("Device push notifications", "Permission granted, device not registered."))
    .toBe("Device push notifications. Permission granted, device not registered.");
});
