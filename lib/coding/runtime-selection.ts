export function selectPythonRuntime({ demo, browserOnly, remoteAvailable }: { demo: boolean; browserOnly: boolean; remoteAvailable: boolean }) {
  const localOnly = demo || browserOnly;
  return { localOnly, remote: remoteAvailable && !localOnly };
}
