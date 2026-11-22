export const dynamic = "force-dynamic";

export function GET(): Response {
  // Read runtime values so the worker uses the configuration of this deployment.
  const runtimeEnv = process.env;
  const config = {
    apiKey: runtimeEnv.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: runtimeEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: runtimeEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: runtimeEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: runtimeEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: runtimeEnv.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: runtimeEnv.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  };
  const configured = [config.apiKey, config.projectId, config.messagingSenderId, config.appId]
    .every((value) => value?.trim());

  return new Response(
    configured
      ? `self.__FIREBASE_CONFIG__ = ${JSON.stringify(config)};`
      : 'throw new Error("Firebase messaging is not configured.");',
    {
      status: configured ? 200 : 503,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
