export const fixtureDatabase = "postgresql://native_preview:native_preview@127.0.0.1:55453/native_preview";
export const fixtureOrigin = "https://127.0.0.1:9443";
export const fixtureHost = "127.0.0.1";
export const fixturePort = 9443;

export function assertFixtureRunner(env = process.env) {
  if (env.GITHUB_ACTIONS !== "true" || env.RUNNER_ENVIRONMENT !== "github-hosted" ||
    env.NATIVE_PRODUCT_AUTH_FIXTURE !== "1" || env.DATABASE_URL !== fixtureDatabase) {
    throw new Error("The auth fixture requires its GitHub-hosted loopback PostgreSQL service");
  }
}
