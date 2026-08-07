import {
  createSession,
  findUserCredentials,
  isSecureRequest,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  verifyPassword,
} from "../../_lib/demo-auth";
import { apiError, jsonResponse, readJsonObject } from "../../_lib/http";

type LoginAttempt = {
  failures: number;
  windowStartedAt: number;
  blockedUntil: number;
  lastSeenAt: number;
};

type LoginGlobal = typeof globalThis & {
  __portalDemoLoginAttempts?: Map<string, LoginAttempt>;
};

const MAX_FAILURES = 5;
const ATTEMPT_WINDOW_MS = 10 * 60_000;
const BLOCK_DURATION_MS = 5 * 60_000;
const AUTH_FAILURE_MESSAGE =
  "Não foi possível autenticar. Verifique os dados e tente novamente.";

const loginGlobal = globalThis as LoginGlobal;
const attempts =
  loginGlobal.__portalDemoLoginAttempts ??
  (loginGlobal.__portalDemoLoginAttempts = new Map<string, LoginAttempt>());

function clientKey(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

function pruneAttempts(now: number) {
  for (const [key, attempt] of attempts) {
    const staleAfter = Math.max(
      attempt.blockedUntil,
      attempt.lastSeenAt + ATTEMPT_WINDOW_MS,
    );
    if (staleAfter <= now) attempts.delete(key);
  }
}

function activeAttempt(key: string, now: number) {
  const attempt = attempts.get(key);
  if (!attempt) return null;
  if (attempt.blockedUntil > now) return attempt;
  if (now - attempt.windowStartedAt >= ATTEMPT_WINDOW_MS) {
    attempts.delete(key);
    return null;
  }
  return attempt;
}

function registerFailure(key: string, now: number) {
  const current = activeAttempt(key, now);
  const failures = (current?.failures ?? 0) + 1;
  const next: LoginAttempt = {
    failures,
    windowStartedAt: current?.windowStartedAt ?? now,
    blockedUntil:
      failures >= MAX_FAILURES ? now + BLOCK_DURATION_MS : 0,
    lastSeenAt: now,
  };
  attempts.set(key, next);
  return next;
}

export async function POST(request: Request) {
  const now = Date.now();
  pruneAttempts(now);
  const key = clientKey(request);
  const currentAttempt = activeAttempt(key, now);

  if (currentAttempt?.blockedUntil && currentAttempt.blockedUntil > now) {
    const retryAfter = Math.max(
      1,
      Math.ceil((currentAttempt.blockedUntil - now) / 1000),
    );
    const response = apiError(429, AUTH_FAILURE_MESSAGE);
    response.headers.set("Retry-After", String(retryAfter));
    return response;
  }

  const payload = await readJsonObject(request);
  const rawLogin = payload?.email;
  const rawPassword = payload?.password;
  if (
    typeof rawLogin !== "string" ||
    typeof rawPassword !== "string" ||
    !rawLogin.trim() ||
    !rawPassword ||
    rawLogin.length > 254 ||
    rawPassword.length > 128
  ) {
    const attempt = registerFailure(key, now);
    if (attempt.blockedUntil > now) {
      const response = apiError(429, AUTH_FAILURE_MESSAGE);
      response.headers.set(
        "Retry-After",
        String(Math.ceil((attempt.blockedUntil - now) / 1000)),
      );
      return response;
    }
    return apiError(422, AUTH_FAILURE_MESSAGE);
  }

  let credential: Awaited<ReturnType<typeof findUserCredentials>> = null;
  let passwordMatches = false;
  try {
    credential = await findUserCredentials(rawLogin);
    passwordMatches = Boolean(
      credential?.active &&
        (await verifyPassword(
          rawPassword,
          credential.passwordSalt,
          credential.passwordHash,
        )),
    );
  } catch {
    // Mantém a resposta de autenticação genérica se o provedor criptográfico falhar.
  }
  if (!credential || !passwordMatches) {
    const attempt = registerFailure(key, now);
    if (attempt.blockedUntil > now) {
      const response = apiError(429, AUTH_FAILURE_MESSAGE);
      response.headers.set(
        "Retry-After",
        String(Math.ceil((attempt.blockedUntil - now) / 1000)),
      );
      return response;
    }
    return apiError(401, AUTH_FAILURE_MESSAGE);
  }

  attempts.delete(key);
  const token = await createSession(credential.user);
  const response = jsonResponse({ user: credential.user });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    expires: new Date(now + SESSION_TTL_SECONDS * 1000),
  });
  return response;
}
