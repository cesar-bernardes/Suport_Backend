import { supportDatabase } from "./supabase";

export { loginRateLimitKey } from "./login-rate-limit-key";

export const MAX_LOGIN_FAILURES = 5;
export const LOGIN_ATTEMPT_WINDOW_SECONDS = 10 * 60;
export const LOGIN_BLOCK_SECONDS = 5 * 60;

export type LoginAttempt = {
  failures: number;
  windowStartedAt: number;
  blockedUntil: number;
};

type LoginAttemptRow = {
  failures: number;
  window_started_at: string;
  blocked_until: string | null;
};

type LoginRateLimitGlobal = typeof globalThis & {
  __portalLoginAttemptsFallback?: Map<string, LoginAttempt>;
};

const fallbackGlobal = globalThis as LoginRateLimitGlobal;
const fallbackAttempts =
  fallbackGlobal.__portalLoginAttemptsFallback ??
  (fallbackGlobal.__portalLoginAttemptsFallback = new Map<string, LoginAttempt>());

function persistentRateLimitEnabled() {
  return process.env.PERSISTENT_LOGIN_RATE_LIMIT === "true";
}

function toAttempt(row: LoginAttemptRow): LoginAttempt {
  return {
    failures: row.failures,
    windowStartedAt: Date.parse(row.window_started_at),
    blockedUntil: row.blocked_until ? Date.parse(row.blocked_until) : 0,
  };
}

function getFallbackAttempt(clientKey: string, now: number) {
  const attempt = fallbackAttempts.get(clientKey);
  if (!attempt) return null;
  const windowExpired =
    now - attempt.windowStartedAt >= LOGIN_ATTEMPT_WINDOW_SECONDS * 1_000;
  const blockExpired = !attempt.blockedUntil || attempt.blockedUntil <= now;
  if (windowExpired && blockExpired) {
    fallbackAttempts.delete(clientKey);
    return null;
  }
  return attempt;
}

export async function getLoginAttempt(clientKey: string, now: number) {
  if (!persistentRateLimitEnabled()) return getFallbackAttempt(clientKey, now);

  const database = supportDatabase();
  const cleanup = await database
    .from("portal_login_attempts")
    .delete()
    .lt("updated_at", new Date(now - 24 * 60 * 60 * 1_000).toISOString());
  if (cleanup.error) throw new Error(cleanup.error.message);

  const result = await database
    .from("portal_login_attempts")
    .select("failures,window_started_at,blocked_until")
    .eq("client_key", clientKey)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) return null;

  const attempt = toAttempt(result.data as LoginAttemptRow);
  const windowExpired =
    now - attempt.windowStartedAt >= LOGIN_ATTEMPT_WINDOW_SECONDS * 1_000;
  const blockExpired = !attempt.blockedUntil || attempt.blockedUntil <= now;
  if (windowExpired && blockExpired) {
    await clearLoginAttempt(clientKey);
    return null;
  }
  return attempt;
}

export async function registerLoginFailure(clientKey: string, now: number) {
  if (!persistentRateLimitEnabled()) {
    const current = getFallbackAttempt(clientKey, now);
    const failures = (current?.failures ?? 0) + 1;
    const attempt: LoginAttempt = {
      failures,
      windowStartedAt: current?.windowStartedAt ?? now,
      blockedUntil:
        failures >= MAX_LOGIN_FAILURES ? now + LOGIN_BLOCK_SECONDS * 1_000 : 0,
    };
    fallbackAttempts.set(clientKey, attempt);
    return attempt;
  }

  const result = await supportDatabase().rpc("register_portal_login_failure", {
    p_client_key: clientKey,
    p_now: new Date(now).toISOString(),
    p_window_seconds: LOGIN_ATTEMPT_WINDOW_SECONDS,
    p_max_failures: MAX_LOGIN_FAILURES,
    p_block_seconds: LOGIN_BLOCK_SECONDS,
  });
  if (result.error) throw new Error(result.error.message);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row) throw new Error("Supabase returned no login rate-limit data.");
  return toAttempt(row as LoginAttemptRow);
}

export async function clearLoginAttempt(clientKey: string) {
  if (!persistentRateLimitEnabled()) {
    fallbackAttempts.delete(clientKey);
    return;
  }
  const result = await supportDatabase()
    .from("portal_login_attempts")
    .delete()
    .eq("client_key", clientKey);
  if (result.error) throw new Error(result.error.message);
}
