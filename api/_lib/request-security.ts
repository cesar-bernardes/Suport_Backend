function configuredMutationOrigins() {
  return new Set(
    (process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function forwardedRequestOrigin(request: Request) {
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (!host) return null;
  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return null;
  }
}

export function sameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const callerOrigin = new URL(origin).origin;
    const requestOrigin = new URL(request.url).origin;
    const forwardedOrigin = forwardedRequestOrigin(request);
    return (
      callerOrigin === requestOrigin ||
      callerOrigin === forwardedOrigin ||
      configuredMutationOrigins().has(callerOrigin)
    );
  } catch {
    return false;
  }
}
