import os, subprocess, sys
from pathlib import Path
repo=Path(__file__).resolve().parents[2]
env=os.environ.copy()
# Retain injected AI credentials and proxy/CA settings. Isolate all application data.
for key in ['TURSO_DATABASE_URL','TURSO_CONNECTION_URL','TURSO_AUTH_TOKEN','CF_KV_NAMESPACE_ID','VECTORIZE_WORKER_URL','VECTORIZE_SHARED_SECRET','ZYRA_CONTROL_PLANE_URL','ZYRA_CONTROL_PLANE_TOKEN','R2_ENDPOINT','R2_BUCKET','R2_PUBLIC_URL','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','INNGEST_EVENT_KEY','INNGEST_SIGNING_KEY','NEXT_PUBLIC_SENTRY_DSN','SENTRY_AUTH_TOKEN','NEXT_PUBLIC_POSTHOG_KEY','NEXT_PUBLIC_FIREBASE_API_KEY','FIREBASE_SERVICE_ACCOUNT_JSON','NEXT_PUBLIC_REALTIME_URL']:
 env[key]=''
env.update(DATABASE_URL='file:/tmp/zyx-coding-live.db',NODE_ENV='development',ZYX_ENVIRONMENT='local',ALLOW_STAGING_MUTATION='0',BETTER_AUTH_URL='http://127.0.0.1:3000',NEXT_PUBLIC_APP_URL='http://127.0.0.1:3000',NEXT_PUBLIC_REALTIME_URL='http://127.0.0.1:3001',SKIP_ENV_VALIDATION='1',NEXT_TELEMETRY_DISABLED='1',PLAYWRIGHT_BROWSERS_PATH='/tmp/zyx-playwright',NODE_USE_ENV_PROXY='1')
# The foreground notification listener validates config on mount. Use fictional
# public SDK identifiers instead of mixing an empty key with remote project IDs.
# Push permission/token registration is not part of these local coding probes.
env.update(NEXT_PUBLIC_FIREBASE_API_KEY='local-coding-placeholder',NEXT_PUBLIC_FIREBASE_PROJECT_ID='coding-local',NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN='coding-local.invalid',NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET='coding-local.invalid',NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID='000000000000',NEXT_PUBLIC_FIREBASE_APP_ID='1:000000000000:web:0000000000000000000000',NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID='',NEXT_PUBLIC_FIREBASE_VAPID_KEY='')
raise SystemExit(subprocess.call(sys.argv[1:],env=env,cwd=repo))
