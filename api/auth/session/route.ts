import {
  isSecureRequest,
  sessionUser,
  SESSION_COOKIE,
} from "../../_lib/demo-auth";
import { apiError, jsonResponse } from "../../_lib/http";

export async function GET(request: Request) {
  const user = await sessionUser(request);
  if (!user) {
    const response = apiError(401, "Sessão inválida ou expirada.");
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
  return jsonResponse({ user });
}
