import {
  isSecureRequest,
  revokeSession,
  SESSION_COOKIE,
} from "../../_lib/demo-auth";
import { jsonResponse } from "../../_lib/http";

export async function POST(request: Request) {
  await revokeSession(request);
  const response = jsonResponse({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}
