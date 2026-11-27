import { expect, test } from "bun:test";
import { petSceneDocument, petSceneOptions } from "../../apps/mobile-native/features/student/pet/preview-document";

test("pet scenes choose registered models, fitted outfits and compatible actions", () => {
  expect(petSceneOptions("unknown")).toBeNull();
  const cat = petSceneOptions("zyra-avatar-studio-cat", "pet-suit-cyclist-outfit", "pet-action-cycle");
  expect(cat).toMatchObject({ model: "studio-cat", suit: "cyclist-outfit", animation: "cycle", cycle: true });
  expect(petSceneOptions("zyra-avatar-studio-rhino", "../hat", "pet-action-cycle")).toMatchObject({ suit: "none", animation: "idle", cycle: false });
  expect(petSceneOptions("zyra-avatar-elang", "pet-suit-cyclist-outfit")).toMatchObject({ model: "elang", suit: "none" });
});

test("preview documents restrict resource access to first-party mascot assets", () => {
  const scene = petSceneOptions("zyra-avatar-studio-cat")!;
  const origin = "https://school.example.test";
  const html = petSceneDocument(scene, origin, "scene-uuid", "const demo = '</script>'; ", false);
  expect(html).toContain("connect-src " + origin + "/gamification/mascots/");
  expect(html).toContain("default-src 'none'");
  expect(html.match(/<\/script>/g)).toHaveLength(1);
  for (const value of [origin + "/untrusted", "http://school.example.test", "data:text/html,x"]) {
    expect(() => petSceneDocument(scene, value, "scene-uuid", "", false)).toThrow();
  }
});
