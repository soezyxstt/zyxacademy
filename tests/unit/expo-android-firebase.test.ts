import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import type { NativePushDevice } from "../../apps/mobile-native/device/notifications-controller";

const require = createRequire(import.meta.url);
const project = resolve("apps/mobile-native");
const { ANDROID_PACKAGE, CAPABILITY, readStagingFirebase, validateStagingFirebase } = require(
  "../../apps/mobile-native/plugins/staging-firebase-config.js",
);
const releasePackage = "com.zyx.academy";
const clientKey = "fixture-android-client-key";

function client(packageName = ANDROID_PACKAGE) {
  return { client_info: { android_client_info: { package_name: packageName }, mobilesdk_app_id: "1:12345:android:abcdef" },
    api_key: [{ current_key: clientKey }] };
}

const firebase = { project_info: { project_id: "zyx-academy-staging", project_number: "12345" }, client: [client(releasePackage), client()] };

test("the Android build selects exactly one staging client for the Expo application", () => {
  const check = (data: unknown, packageName = ANDROID_PACKAGE) => validateStagingFirebase(JSON.stringify(data), packageName);
  expect(JSON.parse(readFileSync(join(project, "app.json"), "utf8")).expo.android.package).toBe(ANDROID_PACKAGE);
  expect(check(firebase)).toEqual({ ...firebase, client: [client()] });
  expect(() => check(firebase, releasePackage)).toThrow("Expo application package exactly once");
  expect(() => check({ ...firebase, client: [client(releasePackage)] })).toThrow("Expo application package exactly once");
  expect(() => check({ ...firebase, client: [client(), client()] })).toThrow("Expo application package exactly once");
  expect(() => check({ ...firebase, project_info: { ...firebase.project_info, project_id: "zyx-academy" } })).toThrow("staging Firebase project");
  expect(() => check({ ...firebase, project_info: { ...firebase.project_info, project_number: "98765" } })).toThrow("valid Android app ID");
  expect(() => check({ ...firebase, client: [{ ...client(), api_key: [] }] })).toThrow("valid Android app ID");
  expect(() => check({ ...firebase, client: [{ ...client(), api_key: [{ current_key: "invalid key" }, ...client().api_key] }] }))
    .toThrow("valid Android app ID");
  expect(() => check({ type: "service_account", private_key: "fixture-private-key" })).toThrow("Server credentials are prohibited");
  expect(() => check({ ...firebase, client: [{ ...client(), private_key: "fixture-private-key" }] })).toThrow("Server credentials are prohibited");
  expect(() => validateStagingFirebase(`invalid ${clientKey}`, ANDROID_PACKAGE)).toThrow(/^Expo Android Firebase requires valid client JSON\.$/);
});

type Gradle = { language: "groovy"; contents: string };
type AppManifest = { metadata: Record<string, string> };
type Mod = { modRequest: { platformProjectRoot: string }; modResults: Gradle | AppManifest };
type Config = { android: { package: string; googleServicesFile?: string }; plugins?: string[]; mods?: Record<string, (mod: Mod) => Mod | Promise<Mod>> };

function buildConfig(projectRoot: string, android: Config["android"]) {
  const wrap = (name: string) => (config: Config, callback: (mod: Mod) => Mod | Promise<Mod>) =>
    ({ ...config, mods: { ...config.mods, [name]: callback } });
  const testPlugins = {
    withProjectBuildGradle: wrap("project"), withAppBuildGradle: wrap("app"), withAndroidManifest: wrap("manifest"),
    withDangerousMod: (config: Config, [, callback]: [string, (mod: Mod) => Mod | Promise<Mod>]) => wrap("file")(config, callback),
    AndroidConfig: {
      GoogleServices: {
        setClassPath: (_: Config, source: string) => source.includes("com.google.gms:google-services") ? source
          : source.replace("dependencies {", "dependencies {\n  classpath 'com.google.gms:google-services:4.4.4'"),
        applyPlugin: (_: Config, source: string) => source.includes("com.google.gms.google-services") ? source
          : source + "\napply plugin: 'com.google.gms.google-services'",
      },
      Manifest: {
        getMainApplicationOrThrow: (manifest: AppManifest) => manifest.metadata,
        addMetaDataItemToMainApplication: (metadata: Record<string, string>, key: string, value: string) => { metadata[key] = value; },
        removeMetaDataItemFromMainApplication: (metadata: Record<string, string>, key: string) => { delete metadata[key]; },
      },
    },
  };
  function load<T>(file: string, directory: string, overrides: Record<string, unknown>): T {
    const module = { exports: {} };
    const local = createRequire(file);
    runInNewContext(readFileSync(file, "utf8"), {
      module, __dirname: directory, process: { env: { EXPO_PUBLIC_PARITY_WEBVIEW: "1" } },
      require: (name: string) => Object.hasOwn(overrides, name) ? overrides[name] : local(name),
    });
    return module.exports as T;
  }
  const plugin = load(join(project, "plugins/with-staging-firebase.js"), project, { "expo/config-plugins": testPlugins });
  const configFor = load<(input: { config: Config }) => Config>(join(project, "app.config.js"), projectRoot,
    { "./plugins/with-staging-firebase": plugin });
  return configFor({ config: { android, plugins: ["expo-notifications"] } });
}

test("the native mods enable the installed capability and can remove it on a credential-free rebuild", async () => {
  const root = mkdtempSync(join(tmpdir(), "expo-firebase-fixture-"));
  try {
    const platformProjectRoot = join(root, "android");
    mkdirSync(join(platformProjectRoot, "app"), { recursive: true });
    const explicit = join(root, "local-client.json");
    writeFileSync(explicit, JSON.stringify(firebase));
    const disabled = { package: ANDROID_PACKAGE };
    expect(readStagingFirebase(root, disabled)).toBeNull();
    expect(() => readStagingFirebase(root, { ...disabled, googleServicesFile: "missing-client.json" })).toThrow(
      /^Expo Android Firebase client file could not be read\.$/,
    );
    const config = buildConfig(root, { ...disabled, googleServicesFile: explicit });
    expect(config.android).toEqual(disabled);
    expect(config.plugins).toContain("./plugins/with-parity-loopback");
    expect(JSON.stringify(config)).not.toContain(explicit);
    expect(JSON.stringify(config)).not.toContain(clientKey);
    const gradle: Record<string, Gradle> = {
      project: { language: "groovy", contents: "dependencies {\n}\n" },
      app: { language: "groovy", contents: "apply plugin: 'com.android.application'\n" },
    };
    const manifest = { metadata: { unrelated: "preserved" } };
    const apply = async (value: Config) => {
      for (const [name, modResults] of Object.entries({ ...gradle, manifest, file: manifest })) {
        await value.mods?.[name]({ modResults, modRequest: { platformProjectRoot } });
      }
    };
    await apply(config);
    const applied = { project: gradle.project.contents, app: gradle.app.contents };
    const target = join(platformProjectRoot, "app/google-services.json");
    expect(applied.project).toContain("classpath 'com.google.gms:google-services:");
    expect(applied.app).toContain("apply plugin: 'com.google.gms.google-services'");
    expect(manifest.metadata).toEqual({ unrelated: "preserved", [CAPABILITY]: client().client_info.mobilesdk_app_id });
    expect(JSON.parse(readFileSync(target, "utf8")).client).toEqual([client()]);
    await apply(buildConfig(root, { ...disabled, googleServicesFile: explicit }));
    expect(gradle.project.contents).toBe(applied.project);
    expect(gradle.app.contents).toBe(applied.app);
    await apply(buildConfig(root, disabled));
    expect(gradle.project.contents).not.toContain("com.google.gms:google-services");
    expect(gradle.app.contents).not.toContain("com.google.gms.google-services");
    expect(manifest.metadata).toEqual({ unrelated: "preserved" });
    expect(existsSync(target)).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("registration uses the capability of the installed Android binary", async () => {
  const built = await Bun.build({ entrypoints: ["./apps/mobile-native/device/notifications.ts"], format: "cjs", external: ["*"], write: false });
  const source = await built.outputs[0].text();
  for (const [platform, expoGo, native, expected] of [
    ["android", false, true, true], ["android", false, false, false], ["android", false, null, false],
    ["android", true, true, false], ["ios", false, true, false],
  ] as const) {
    const module = { exports: {} as { createExpoNotificationController(options: object): { dispose(): void } } };
    let observed: NativePushDevice["registration"] | undefined;
    const dependencies: Record<string, unknown> = {
      expo: { isRunningInExpoGo: () => expoGo, requireOptionalNativeModule: (name: string) => {
        expect(name).toBe("ZyxAndroidPushConfiguration");
        return native === null ? null : { isConfigured: () => native };
      } },
      "react-native": { Platform: { OS: platform }, AppState: { addEventListener: () => ({ remove() {} }) } },
      "./notifications-controller": { createNativePushController: (device: NativePushDevice) => {
        observed = device.registration;
        return { dispose() {} };
      } },
    };
    runInNewContext(source, { module, exports: module.exports, require: (name: string) => dependencies[name] });
    module.exports.createExpoNotificationController({}).dispose();
    expect(observed).toEqual(expected ? { platform: "android", transport: "fcm", device: "expo-android" } : null);
  }
});
