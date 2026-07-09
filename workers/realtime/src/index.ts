import { LiveQuizRoom } from "./room";

export { LiveQuizRoom };

interface Env {
  LIVE_QUIZ_ROOM: DurableObjectNamespace;
  LIVE_HMAC_SECRET: string;
  NEXT_APP_URL: string;
}

const CORS_METHODS = "GET, POST, OPTIONS";
const CORS_HEADERS = "Content-Type, Authorization, Upgrade, Connection";

function cors(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": CORS_METHODS,
    "Access-Control-Allow-Headers": CORS_HEADERS,
  };
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") ?? "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    // /room/:sessionId/(websocket|init|control)
    const match = url.pathname.match(/^\/room\/([^/]+)\/(websocket|init|control)$/);
    if (!match) {
      return new Response("Not Found", { status: 404, headers: cors(origin) });
    }

    const [, sessionId] = match;
    const doId = env.LIVE_QUIZ_ROOM.idFromName(sessionId);
    const room = env.LIVE_QUIZ_ROOM.get(doId);
    return room.fetch(request);
  },
};

export default worker;
