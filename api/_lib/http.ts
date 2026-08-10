import { NextResponse } from "next/server";

const DEFAULT_ALLOWED_MUTATION_ORIGINS = [
  "https://suporte-front.vercel.app",
  "https://portal-ocorrencias-suporte-2026.cesar727476.chatgpt.site",
];

function allowedMutationOrigins() {
  const configured = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_MUTATION_ORIGINS, ...configured]);
}

export function jsonResponse(
  body: unknown,
  init?: ResponseInit,
) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export function apiError(status: number, message: string) {
  return jsonResponse({ message }, { status });
}

export async function readJsonObject(request: Request) {
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function sameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const requestOrigin = new URL(request.url).origin;
    const callerOrigin = new URL(origin).origin;
    return (
      callerOrigin === requestOrigin ||
      allowedMutationOrigins().has(callerOrigin)
    );
  } catch {
    return false;
  }
}

export function cleanRequiredString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
