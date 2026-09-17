import {
  createSession,
  findUserCredentials,
  isSecureRequest,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  verifyPassword,
} from "../../_lib/demo-auth";
import { apiError, jsonResponse, readJsonObject } from "../../_lib/http";
import {
  clearLoginAttempt,
  getLoginAttempt,
  loginRateLimitKey,
  registerLoginFailure,
} from "../../_lib/login-rate-limit";

const AUTH_FAILURE_MESSAGE =
  "Não foi possível autenticar. Verifique os dados e tente novamente.";

function rateLimitUnavailable() {
  return apiError(503, "O controle de acesso está temporariamente indisponível. Tente novamente em instantes.");
}

function blockedResponse(blockedUntil: number, now: number) {
  const retryAfter = Math.max(1, Math.ceil((blockedUntil - now) / 1_000));
  const response = apiError(429, AUTH_FAILURE_MESSAGE);
  response.headers.set("Retry-After", String(retryAfter));
  return response;
}

export async function POST(request: Request) {
  const now = Date.now();
  const key = await loginRateLimitKey(request);
  let currentAttempt;
  try {
    currentAttempt = await getLoginAttempt(key, now);
  } catch {
    return rateLimitUnavailable();
  }
  if (currentAttempt?.blockedUntil && currentAttempt.blockedUntil > now) {
    return blockedResponse(currentAttempt.blockedUntil, now);
  }

  const payload = await readJsonObject(request);
  const rawLogin = payload?.email;
  const rawPassword = payload?.password;
  if (typeof rawLogin !== "string" || typeof rawPassword !== "string" || !rawLogin.trim() || !rawPassword || rawLogin.length > 254 || rawPassword.length > 128) {
    try {
      const attempt = await registerLoginFailure(key, now);
      if (attempt.blockedUntil > now) return blockedResponse(attempt.blockedUntil, now);
    } catch {
      return rateLimitUnavailable();
    }
    return apiError(422, AUTH_FAILURE_MESSAGE);
  }

  let credential: Awaited<ReturnType<typeof findUserCredentials>> = null;
  let passwordMatches = false;
  try {
    credential = await findUserCredentials(rawLogin);
    passwordMatches = Boolean(credential?.active && (await verifyPassword(rawPassword, credential.passwordSalt, credential.passwordHash)));
  } catch {
    // Mantém a resposta de autenticação genérica se o provedor criptográfico falhar.
  }
  if (!credential || !passwordMatches) {
    try {
      const attempt = await registerLoginFailure(key, now);
      if (attempt.blockedUntil > now) return blockedResponse(attempt.blockedUntil, now);
    } catch {
      return rateLimitUnavailable();
    }
    return apiError(401, AUTH_FAILURE_MESSAGE);
  }

  try {
    await clearLoginAttempt(key);
  } catch {
    return rateLimitUnavailable();
  }
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
