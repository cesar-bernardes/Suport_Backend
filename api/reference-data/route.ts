import { sessionUser } from "../_lib/demo-auth";
import { apiError, jsonResponse } from "../_lib/http";
import { listReferenceData } from "../_lib/reference-data";

export async function GET(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");
  return jsonResponse(await listReferenceData());
}
