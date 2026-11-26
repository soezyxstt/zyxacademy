import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";

test("disabled controls use the rounded half-alpha byte through Android HWUI's float conversion", async () => {
  const compiled = await Bun.build({ entrypoints: ["./apps/mobile-native/components/control-opacity.ts"], format: "cjs", external: ["react-native"], write: false });
  const source = await compiled.outputs[0].text();
  const opacityFor = (OS: string) => {
    const module = { exports: {} as { disabledControlStyle: { opacity: number } } };
    runInNewContext(source, { module, exports: module.exports, require: () => ({ Platform: { OS } }) });
    return module.exports.disabledControlStyle.opacity;
  };
  const hwuiAlpha = (opacity: number) => Math.trunc(Math.fround(Math.fround(opacity) * 255));
  const over = (source: readonly number[], background: number, alpha: number) =>
    source.map(channel => Math.round((channel * alpha + background * (255 - alpha)) / 255));

  const legacy = hwuiAlpha(0.5);
  const android = hwuiAlpha(opacityFor("android"));
  expect(legacy).toBe(127);
  expect(android).toBe(128);
  expect(over([103, 139, 228], 29, legacy)).toEqual([66, 84, 128]);
  expect(over([103, 139, 228], 29, android)).toEqual([66, 84, 129]);
  expect(over([6, 11, 24], 29, android)).toEqual([17, 20, 26]);
  expect(over([224, 224, 224], 255, legacy)).toEqual([240, 240, 240]);
  expect(over([224, 224, 224], 255, android)).toEqual([239, 239, 239]);
  expect(opacityFor("ios")).toBe(0.5);
  expect(opacityFor("web")).toBe(0.5);
});
