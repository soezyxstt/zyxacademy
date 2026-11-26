import { expect, test } from "bun:test";
import { createNativeConnectivity } from "../../apps/mobile-native/device/connectivity";
import { operationsCatalog } from "../../lib/admin-mcp/operations-catalog";

const disconnected = { type: "NONE", isConnected: false };
const connected = { type: "WIFI", isConnected: true, isInternetReachable: true };

test("only confirmed foreground reconnect reverifies the session before notifying sync", () => {
  const events: string[] = [];
  const device = createNativeConnectivity({ reverify: () => { events.push("verify"); } });
  device.subscribe(() => { events.push(String(device.getSnapshot().online)); });
  device.updateForeground(true);
  device.updateNetwork(disconnected);
  device.updateNetwork({ type: "UNKNOWN" });
  device.updateNetwork({ type: "WIFI" });
  expect(device.getSnapshot().online).toBe(false);
  device.updateNetwork(connected);
  device.updateNetwork(connected);
  expect(events).toEqual(["verify", "undefined", "false", "verify", "true"]);
});

test("reconnect while backgrounded defers verification until the app becomes active", () => {
  const events: boolean[] = [];
  const device = createNativeConnectivity({ reverify: () => { events.push(device.getSnapshot().foreground); } });
  device.updateNetwork(disconnected);
  device.updateNetwork(connected);
  expect(events).toEqual([]);
  device.updateForeground(true);
  device.updateForeground(true);
  expect(events).toEqual([true]);
});

test("the device's foreground offline recovery stays outside the MCP tool surface", () => {
  const entry = operationsCatalog.find(item => item.source === "apps/mobile-native/offline/lifecycle-provider.tsx");
  expect(entry).toMatchObject({ status: "excluded", tools: [], actions: ["foregroundSync"] });
});
