import { expect, test } from "bun:test";

import { avatarCases, avatarPosition, invalidAvatarImage } from "../../packages/ui-parity/avatar-cases";
import { galleryCases } from "../../packages/ui-parity/gallery";

test("both galleries register the 32-pixel portrait, failed asset and fallback states", () => {
  expect(avatarPosition).toEqual({ position: "absolute", left: 144, top: 34, width: 32, height: 32 });
  expect(galleryCases.filter(item => item.component === "avatar").map(item => item.id))
    .toEqual(avatarCases.map(item => item.id));
  expect(avatarCases.map(({ source, status, theme }) => ({ source, status, theme }))).toEqual([
    { source: "portrait", status: "loaded", theme: "light" },
    { source: "invalid", status: "error", theme: "light" },
    { source: "none", status: "idle", theme: "dark" },
  ]);
});

test("the failure fixture is a local, valid data URL containing undecodable image bytes", () => {
  const image = new URL(invalidAvatarImage);
  const [contentType, contents] = image.pathname.split(",");
  expect(image.protocol).toBe("data:");
  expect(contentType).toBe("image/png;base64");
  expect(atob(contents ?? "")).toBe("not-a-png");
});
