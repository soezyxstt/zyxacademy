const maxSeconds = 7 * 24 * 60 * 60;
const videoId = /^[A-Za-z0-9_-]{11}$/u;

export type YouTubePlaybackEvent = { type: "ended" | "failed" } |
  { type: "checkpoint"; time: number; duration?: number };

export function youtubePlaybackEvent(raw: string, nonce: string): YouTubePlaybackEvent | null {
  if (typeof raw !== "string" || raw.length > 512) return null;
  try {
    const event = JSON.parse(raw);
    if (event?.nonce !== nonce) return null;
    if (event.type === "ended" || event.type === "failed") return { type: event.type };
    const { time, duration } = event;
    if (event.type !== "checkpoint" || typeof time !== "number" || !Number.isFinite(time) || time < 0 || time > maxSeconds) return null;
    return { type: "checkpoint", time, duration: typeof duration === "number" && duration > 0 && duration <= maxSeconds ? duration : undefined };
  } catch { return null; }
}

export function buildYouTubePlaybackFrame(id: string, origin: string, startTime: number, nonce: string) {
  if (!videoId.test(id) || !/^https:\/\/[a-z][a-z0-9.-]+$/i.test(origin) || !/^[a-f0-9-]{36}$/i.test(nonce)) return null;
  const start = Number.isFinite(startTime) && startTime >= 3 && startTime <= maxSeconds ? Math.floor(startTime) : 0;
  const baseUrl = origin + "/course-playback";
  const embedUrl = "https://www.youtube.com/embed/" + id;
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src https://www.youtube.com; script-src 'nonce-${nonce}' https://www.youtube.com https://s.ytimg.com; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<style>html,body,#player{width:100%;height:100%;margin:0;background:#000;border:0}</style></head><body><div id="player"></div>
<script nonce="${nonce}">
  let player, timer;
  const send = (type, details = {}) => window.ReactNativeWebView?.postMessage(JSON.stringify({ type, nonce: "${nonce}", ...details }));
  const checkpoint = () => {
    if (player && typeof player.getCurrentTime === "function") send("checkpoint", { time: player.getCurrentTime(), duration: player.getDuration() });
  };
  window.onYouTubeIframeAPIReady = () => {
    player = new YT.Player("player", {
      videoId: "${id}",
      playerVars: { autoplay: 1, playsinline: 1, origin: "${origin}", enablejsapi: 1, start: ${start}, rel: 0 },
      events: { onStateChange(event) {
        clearInterval(timer);
        if (event.data === YT.PlayerState.ENDED) send("ended");
        if (event.data === YT.PlayerState.PAUSED) checkpoint();
        if (event.data === YT.PlayerState.PLAYING) timer = setInterval(checkpoint, 3000);
      }, onError() { send("failed"); } }
    });
  };
  window.addEventListener("pagehide", checkpoint);
  document.addEventListener("visibilitychange", () => { if (document.hidden) checkpoint(); });
  const api = document.createElement("script");
  api.onerror = () => send("failed");
  api.src = "https://www.youtube.com/iframe_api";
  document.head.append(api);
</script></body></html>`;
  return { html, baseUrl, embedUrl, start };
}
