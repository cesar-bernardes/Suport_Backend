import { NextResponse } from "next/server";

export { sameOriginMutation } from "./request-security";

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

export function cleanRequiredString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
