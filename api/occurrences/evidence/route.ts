import { canManageAnyOccurrence, sessionUser, type DemoRole } from "../../_lib/demo-auth";
import { getStoredOccurrence } from "../../_lib/occurrence-db";
import { apiError, jsonResponse, sameOriginMutation } from "../../_lib/http";
import { supportSupabase } from "../../_lib/supabase";

const BUCKET = "occurrence-evidence";
const MAX_FILES = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
  "text/plain",
]);

function canAccess(user: { id: string; role: DemoRole }, responsibleId: string) {
  return canManageAnyOccurrence(user.role) || responsibleId === user.id;
}

function safeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-120);
}

async function ensureBucket() {
  const storage = supportSupabase().storage;
  const result = await storage.getBucket(BUCKET);
  if (!result.error) return;
  const created = await storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_FILE_SIZE,
    allowedMimeTypes: [...ALLOWED_TYPES],
  });
  if (created.error && !/already exists/i.test(created.error.message)) {
    throw new Error(created.error.message);
  }
}

export async function POST(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");
  if (!sameOriginMutation(request)) {
    return apiError(403, "Origem da requisição não autorizada.");
  }

  const form = await request.formData().catch(() => null);
  const occurrenceId = form?.get("occurrenceId");
  if (!form || typeof occurrenceId !== "string" || !occurrenceId.trim()) {
    return apiError(422, "Ocorrência não informada.");
  }

  const occurrence = await getStoredOccurrence(occurrenceId.trim());
  if (!occurrence) return apiError(422, "Ocorrência não encontrada.");
  if (!canAccess(user, occurrence.responsibleId)) {
    return apiError(403, "Você não tem permissão para anexar evidências.");
  }

  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  if (!files.length || files.length > MAX_FILES || occurrence.attachments.length + files.length > MAX_FILES) {
    return apiError(422, "A ocorrência pode ter no máximo 3 evidências.");
  }
  if (files.some((file) => !ALLOWED_TYPES.has(file.type) || file.size > MAX_FILE_SIZE)) {
    return apiError(422, "Use arquivos PNG, JPG, WEBP, MP4 ou TXT de até 10 MB cada.");
  }

  await ensureBucket();
  const storage = supportSupabase().storage.from(BUCKET);
  const uploaded: string[] = [];
  try {
    for (const file of files) {
      const name = safeFileName(file.name) || "evidencia";
      const path = `${occurrence.id}/${crypto.randomUUID()}-${name}`;
      const result = await storage.upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (result.error) throw new Error(result.error.message);
      uploaded.push(path);
    }
  } catch (error) {
    if (uploaded.length) await storage.remove(uploaded);
    return apiError(500, error instanceof Error ? error.message : "Não foi possível enviar as evidências.");
  }

  return jsonResponse({ attachments: uploaded }, { status: 201 });
}

export async function GET(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");

  const url = new URL(request.url);
  const occurrenceId = url.searchParams.get("occurrenceId")?.trim();
  const path = url.searchParams.get("path")?.trim();
  if (!occurrenceId || !path) return apiError(422, "Evidência não informada.");

  const occurrence = await getStoredOccurrence(occurrenceId);
  if (!occurrence || !canAccess(user, occurrence.responsibleId)) {
    return apiError(403, "Você não tem permissão para acessar esta evidência.");
  }
  if (!occurrence.attachments.includes(path) || !path.startsWith(`${occurrence.id}/`)) {
    return apiError(404, "Evidência não encontrada.");
  }

  const signed = await supportSupabase().storage.from(BUCKET).createSignedUrl(path, 60);
  if (signed.error || !signed.data?.signedUrl) {
    return apiError(500, "Não foi possível abrir a evidência.");
  }
  return Response.redirect(signed.data.signedUrl, 302);
}
