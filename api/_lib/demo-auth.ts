import { supportDatabase } from "./supabase";

export type DemoRole = "suporte" | "gestor" | "administrador";
export type DemoUser = { id: string; name: string; email: string; role: DemoRole; title: string };
export type ManagedDemoUser = DemoUser & {
  active: boolean; createdAt: string; updatedAt: string; lastLoginAt: string | null;
};

type UserRow = {
  id: string; name: string; email: string; email_normalized: string;
  username_normalized: string; role: DemoRole; title: string; active: boolean;
  password_salt: string | null; password_hash: string | null;
  created_at: string; updated_at: string; last_login_at: string | null;
  deleted_at: string | null; deleted_by: string | null;
};

export const SESSION_COOKIE = "portal_demo_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const PASSWORD_ITERATIONS = 100_000;

function toDemoUser(row: UserRow): DemoUser {
  return { id: row.id, name: row.name, email: row.email, role: row.role, title: row.title };
}
function toManagedUser(row: UserRow): ManagedDemoUser {
  return { ...toDemoUser(row), active: row.active, createdAt: row.created_at,
    updatedAt: row.updated_at, lastLoginAt: row.last_login_at };
}
function bytesFromHex(value: string) {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  return bytes;
}
function hexFromBytes(value: Uint8Array) {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function derivePasswordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: bytesFromHex(salt), iterations: PASSWORD_ITERATIONS }, key, 256);
  return hexFromBytes(new Uint8Array(bits));
}
export async function createPasswordCredential(password: string) {
  const salt = hexFromBytes(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, passwordHash: await derivePasswordHash(password, salt) };
}
export async function verifyPassword(password: string, salt: string, passwordHash: string) {
  const actual = bytesFromHex(await derivePasswordHash(password, salt));
  const expected = bytesFromHex(passwordHash); let difference = actual.length ^ expected.length;
  for (let index = 0; index < Math.min(actual.length, expected.length); index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0;
}
export function normalizeLogin(value: string) { return value.trim().toLocaleLowerCase("pt-BR"); }
export function roleTitle(role: DemoRole) {
  if (role === "administrador") return "Administrador do portal";
  if (role === "gestor") return "Gestor de suporte";
  return "Analista de suporte";
}
export function isDemoRole(value: unknown): value is DemoRole {
  return ["suporte", "gestor", "administrador"].includes(String(value));
}

export async function ensureIdentitySchema() {
  return Promise.resolve();
}
export async function findUserCredentials(login: string) {
  await ensureIdentitySchema(); const normalized = normalizeLogin(login);
  const result = await supportDatabase().from("portal_users").select("*")
    .is("deleted_at", null).or(`email_normalized.eq.${normalized},username_normalized.eq.${normalized}`).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  const row = result.data as UserRow | null;
  if (!row || !row.password_salt || !row.password_hash) return null;
  return { user: toDemoUser(row), active: row.active, passwordSalt: row.password_salt, passwordHash: row.password_hash };
}
export async function listManagedUsers() {
  await ensureIdentitySchema();
  const result = await supportDatabase().from("portal_users").select("*").is("deleted_at", null).order("active", { ascending: false }).order("name");
  if (result.error) throw new Error(result.error.message);
  return (result.data as UserRow[]).map(toManagedUser);
}
export async function listAssignableUsers() {
  await ensureIdentitySchema();
  const result = await supportDatabase().from("portal_users").select("*").eq("active", true).is("deleted_at", null).order("name");
  if (result.error) throw new Error(result.error.message);
  return (result.data as UserRow[]).map(toDemoUser);
}
export async function getManagedUser(id: string) {
  await ensureIdentitySchema();
  const result = await supportDatabase().from("portal_users").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? toManagedUser(result.data as UserRow) : null;
}
export async function createManagedUser(input: { name: string; email: string; role: DemoRole; password: string }) {
  await ensureIdentitySchema(); const email = normalizeLogin(input.email); const username = email.split("@")[0];
  const duplicate = await supportDatabase().from("portal_users").select("id").or(`email_normalized.eq.${email},username_normalized.eq.${username}`).maybeSingle();
  if (duplicate.error) throw new Error(duplicate.error.message); if (duplicate.data) return null;
  const credential = await createPasswordCredential(input.password); const now = new Date().toISOString();
  const row = { id: `u-${crypto.randomUUID()}`, name: input.name, email,
    email_normalized: email, username_normalized: username, role: input.role,
    title: roleTitle(input.role), active: true, password_salt: credential.salt,
    password_hash: credential.passwordHash, created_at: now, updated_at: now, last_login_at: null };
  const result = await supportDatabase().from("portal_users").insert(row).select("*").single();
  if (result.error) throw new Error(result.error.message);
  return toManagedUser(result.data as UserRow);
}
export async function updateManagedUser(input: { id: string; name: string; role: DemoRole; active: boolean; password?: string }) {
  await ensureIdentitySchema(); const current = await getManagedUser(input.id); if (!current) return null;
  const changes: Record<string, unknown> = { name: input.name, role: input.role, title: roleTitle(input.role), active: input.active, updated_at: new Date().toISOString() };
  if (input.password) { const credential = await createPasswordCredential(input.password); changes.password_salt = credential.salt; changes.password_hash = credential.passwordHash; }
  const result = await supportDatabase().from("portal_users").update(changes).eq("id", input.id).select("*").maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!input.active || input.password) { const removed = await supportDatabase().from("portal_sessions").delete().eq("user_id", input.id); if (removed.error) throw new Error(removed.error.message); }
  return result.data ? toManagedUser(result.data as UserRow) : null;
}
export async function countActiveAdministrators() {
  await ensureIdentitySchema();
  const result = await supportDatabase().from("portal_users").select("id", { count: "exact", head: true }).eq("role", "administrador").eq("active", true).is("deleted_at", null);
  if (result.error) throw new Error(result.error.message); return result.count || 0;
}
export async function validManagedUserId(id: string) {
  await ensureIdentitySchema();
  const result = await supportDatabase().from("portal_users").select("id").eq("id", id).eq("active", true).is("deleted_at", null).maybeSingle();
  if (result.error) throw new Error(result.error.message); return Boolean(result.data);
}
export async function softDeleteManagedUser(id: string, actorId: string) {
  await ensureIdentitySchema(); const now = new Date().toISOString();
  const result = await supportDatabase().from("portal_users").update({ active: false, deleted_at: now, deleted_by: actorId, updated_at: now }).eq("id", id).is("deleted_at", null).select("id").maybeSingle();
  if (result.error) throw new Error(result.error.message); if (!result.data) return false;
  const removed = await supportDatabase().from("portal_sessions").delete().eq("user_id", id); if (removed.error) throw new Error(removed.error.message);
  return true;
}
function sessionToken(request: Request) {
  const encoded = (request.headers.get("cookie") || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!encoded) return null; try { return decodeURIComponent(encoded); } catch { return null; }
}
export async function createSession(user: DemoUser) {
  await ensureIdentitySchema(); const token = crypto.randomUUID(); const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();
  const cleanup = await supportDatabase().from("portal_sessions").delete().lte("expires_at", now.toISOString()); if (cleanup.error) throw new Error(cleanup.error.message);
  const created = await supportDatabase().from("portal_sessions").insert({ token, user_id: user.id, expires_at: expiresAt, created_at: now.toISOString() }); if (created.error) throw new Error(created.error.message);
  const touched = await supportDatabase().from("portal_users").update({ last_login_at: now.toISOString() }).eq("id", user.id); if (touched.error) throw new Error(touched.error.message);
  return token;
}
export async function revokeSession(request: Request) {
  const token = sessionToken(request); if (!token) return; await ensureIdentitySchema();
  const result = await supportDatabase().from("portal_sessions").delete().eq("token", token); if (result.error) throw new Error(result.error.message);
}
export async function sessionUser(request: Request) {
  const token = sessionToken(request); if (!token) return null; await ensureIdentitySchema(); const now = new Date().toISOString();
  const session = await supportDatabase().from("portal_sessions").select("user_id,expires_at").eq("token", token).gt("expires_at", now).maybeSingle();
  if (session.error) throw new Error(session.error.message); if (!session.data) return null;
  const user = await supportDatabase().from("portal_users").select("*").eq("id", session.data.user_id).eq("active", true).is("deleted_at", null).maybeSingle();
  if (user.error) throw new Error(user.error.message); if (!user.data) return null;
  return toDemoUser(user.data as UserRow);
}
export function isSecureRequest(request: Request) {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return new URL(request.url).protocol === "https:" || forwarded === "https";
}
export function canManageCatalog(role: DemoRole) {
  return role === "suporte" || role === "gestor" || role === "administrador";
}
export function canManageAnyOccurrence(role: DemoRole) { return role === "gestor" || role === "administrador"; }
