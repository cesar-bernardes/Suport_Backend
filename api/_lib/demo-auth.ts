import { env } from "cloudflare:workers";

export type DemoRole = "suporte" | "gestor" | "administrador";

export type DemoUser = {
  id: string;
  name: string;
  email: string;
  role: DemoRole;
  title: string;
};

export type ManagedDemoUser = DemoUser & {
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  email_normalized: string;
  username_normalized: string;
  role: DemoRole;
  title: string;
  active: number;
  password_salt: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

export const SESSION_COOKIE = "portal_demo_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const PASSWORD_ITERATIONS = 100_000;

const BUILTIN_USERS: UserRow[] = [
  {
    id: "u1",
    name: "Marcelo Lima",
    email: "marcelo@demo.portal",
    email_normalized: "marcelo@demo.portal",
    username_normalized: "marcelo",
    role: "suporte",
    title: "Analista de suporte",
    active: 1,
    password_salt: "a539c4efee974531406c32253292a8c6",
    password_hash:
      "9e00d615b04344583a8dd55434ecfbdd501792dc7e71443924958171ac3e433a",
    created_at: "2026-08-06T12:00:00.000Z",
    updated_at: "2026-08-06T12:00:00.000Z",
    last_login_at: null,
  },
  {
    id: "u2",
    name: "Ana Torres",
    email: "ana@demo.portal",
    email_normalized: "ana@demo.portal",
    username_normalized: "ana",
    role: "gestor",
    title: "Gestora de suporte",
    active: 1,
    password_salt: "d7ab1fc371c1f43d8ffea7b4a1350445",
    password_hash:
      "e185c2f18ca2209f686c450c9b037e8d08875bad3ab22b28806cdf5b15c49ebd",
    created_at: "2026-08-06T12:00:00.000Z",
    updated_at: "2026-08-06T12:00:00.000Z",
    last_login_at: null,
  },
  {
    id: "u3",
    name: "Carla Nunes",
    email: "carla@demo.portal",
    email_normalized: "carla@demo.portal",
    username_normalized: "carla",
    role: "administrador",
    title: "Administradora",
    active: 1,
    password_salt: "d792aac07e7dd9255fdec2f0ac8ae325",
    password_hash:
      "8febba4e2de1169e308d455b8e6b1c449f4b7e653b3c48f3efc1ecf18364377f",
    created_at: "2026-08-06T12:00:00.000Z",
    updated_at: "2026-08-06T12:00:00.000Z",
    last_login_at: null,
  },
  {
    id: "u4",
    name: "César",
    email: "cesar@granddos.tech",
    email_normalized: "cesar@granddos.tech",
    username_normalized: "cesar",
    role: "administrador",
    title: "Administrador do portal",
    active: 1,
    password_salt: "9d204865106c7cb5eef93b8e092af48e",
    password_hash:
      "16ef4b72fe9c5b20c80bf27fba555efaa0f2dff5622063dd76f00afff134acb0",
    created_at: "2026-08-06T12:00:00.000Z",
    updated_at: "2026-08-06T12:00:00.000Z",
    last_login_at: null,
  },
];

export const DEMO_USERS: DemoUser[] = BUILTIN_USERS.map(toDemoUser);

let schemaPromise: Promise<void> | null = null;

function database() {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }
  return env.DB;
}

function toDemoUser(row: UserRow): DemoUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    title: row.title,
  };
}

function toManagedUser(row: UserRow): ManagedDemoUser {
  return {
    ...toDemoUser(row),
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

function bytesFromHex(value: string) {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

function hexFromBytes(value: Uint8Array) {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function derivePasswordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: bytesFromHex(salt),
      iterations: PASSWORD_ITERATIONS,
    },
    key,
    256,
  );
  return hexFromBytes(new Uint8Array(derivedBits));
}

export async function createPasswordCredential(password: string) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = hexFromBytes(saltBytes);
  return { salt, passwordHash: await derivePasswordHash(password, salt) };
}

export async function verifyPassword(
  password: string,
  salt: string,
  passwordHash: string,
) {
  const actual = bytesFromHex(await derivePasswordHash(password, salt));
  const expected = bytesFromHex(passwordHash);
  let difference = actual.length ^ expected.length;
  for (
    let index = 0;
    index < Math.min(actual.length, expected.length);
    index += 1
  ) {
    difference |= actual[index] ^ expected[index];
  }
  return difference === 0;
}

export function normalizeLogin(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

export function roleTitle(role: DemoRole) {
  if (role === "administrador") return "Administrador do portal";
  if (role === "gestor") return "Gestor de suporte";
  return "Analista de suporte";
}

export function isDemoRole(value: unknown): value is DemoRole {
  return ["suporte", "gestor", "administrador"].includes(String(value));
}

async function initializeSchema() {
  const db = database();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS portal_users (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      email_normalized TEXT NOT NULL UNIQUE,
      username_normalized TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('suporte', 'gestor', 'administrador')),
      title TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT,
      deleted_at TEXT,
      deleted_by TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS portal_sessions (
      token TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES portal_users(id) ON DELETE CASCADE
    )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS portal_sessions_user_id_idx ON portal_sessions(user_id)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS portal_sessions_expires_at_idx ON portal_sessions(expires_at)",
    ),
  ]);

  const userColumns = await db
    .prepare("PRAGMA table_info(portal_users)")
    .all<{ name: string }>();
  const userColumnNames = new Set(userColumns.results.map((column) => column.name));
  if (!userColumnNames.has("deleted_at")) {
    await db.prepare("ALTER TABLE portal_users ADD COLUMN deleted_at TEXT").run();
  }
  if (!userColumnNames.has("deleted_by")) {
    await db.prepare("ALTER TABLE portal_users ADD COLUMN deleted_by TEXT").run();
  }

  await db.batch(
    BUILTIN_USERS.map((user) =>
      db
        .prepare(`INSERT OR IGNORE INTO portal_users (
          id, name, email, email_normalized, username_normalized, role, title,
          active, password_salt, password_hash, created_at, updated_at, last_login_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          user.id,
          user.name,
          user.email,
          user.email_normalized,
          user.username_normalized,
          user.role,
          user.title,
          user.active,
          user.password_salt,
          user.password_hash,
          user.created_at,
          user.updated_at,
          user.last_login_at,
        ),
    ),
  );
}

export async function ensureIdentitySchema() {
  schemaPromise ??= initializeSchema().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

export async function findUserCredentials(login: string) {
  await ensureIdentitySchema();
  const normalized = normalizeLogin(login);
  const row = await database()
    .prepare(
      `SELECT * FROM portal_users
       WHERE deleted_at IS NULL
         AND (email_normalized = ? OR username_normalized = ?)
       LIMIT 1`,
    )
    .bind(normalized, normalized)
    .first<UserRow>();
  if (!row) return null;
  return {
    user: toDemoUser(row),
    active: Boolean(row.active),
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash,
  };
}

export async function listManagedUsers() {
  await ensureIdentitySchema();
  const result = await database()
    .prepare("SELECT * FROM portal_users WHERE deleted_at IS NULL ORDER BY active DESC, name COLLATE NOCASE")
    .all<UserRow>();
  return result.results.map(toManagedUser);
}

export async function listAssignableUsers() {
  await ensureIdentitySchema();
  const result = await database()
    .prepare(
      "SELECT * FROM portal_users WHERE active = 1 AND deleted_at IS NULL ORDER BY name COLLATE NOCASE",
    )
    .all<UserRow>();
  return result.results.map(toDemoUser);
}

export async function getManagedUser(id: string) {
  await ensureIdentitySchema();
  const row = await database()
    .prepare("SELECT * FROM portal_users WHERE id = ? AND deleted_at IS NULL LIMIT 1")
    .bind(id)
    .first<UserRow>();
  return row ? toManagedUser(row) : null;
}

export async function createManagedUser(input: {
  name: string;
  email: string;
  role: DemoRole;
  password: string;
}) {
  await ensureIdentitySchema();
  const email = normalizeLogin(input.email);
  const username = email.split("@")[0];
  const duplicate = await database()
    .prepare(
      `SELECT id FROM portal_users
       WHERE email_normalized = ? OR username_normalized = ?
       LIMIT 1`,
    )
    .bind(email, username)
    .first<{ id: string }>();
  if (duplicate) return null;

  const credential = await createPasswordCredential(input.password);
  const now = new Date().toISOString();
  const row: UserRow = {
    id: `u-${crypto.randomUUID()}`,
    name: input.name,
    email,
    email_normalized: email,
    username_normalized: username,
    role: input.role,
    title: roleTitle(input.role),
    active: 1,
    password_salt: credential.salt,
    password_hash: credential.passwordHash,
    created_at: now,
    updated_at: now,
    last_login_at: null,
    deleted_at: null,
    deleted_by: null,
  };
  await database()
    .prepare(`INSERT INTO portal_users (
      id, name, email, email_normalized, username_normalized, role, title,
      active, password_salt, password_hash, created_at, updated_at, last_login_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      row.id,
      row.name,
      row.email,
      row.email_normalized,
      row.username_normalized,
      row.role,
      row.title,
      row.active,
      row.password_salt,
      row.password_hash,
      row.created_at,
      row.updated_at,
      row.last_login_at,
    )
    .run();
  return toManagedUser(row);
}

export async function updateManagedUser(input: {
  id: string;
  name: string;
  role: DemoRole;
  active: boolean;
  password?: string;
}) {
  await ensureIdentitySchema();
  const current = await database()
    .prepare("SELECT * FROM portal_users WHERE id = ? LIMIT 1")
    .bind(input.id)
    .first<UserRow>();
  if (!current) return null;

  const credential = input.password
    ? await createPasswordCredential(input.password)
    : { salt: current.password_salt, passwordHash: current.password_hash };
  const now = new Date().toISOString();
  await database()
    .prepare(`UPDATE portal_users SET
      name = ?, role = ?, title = ?, active = ?, password_salt = ?,
      password_hash = ?, updated_at = ?
      WHERE id = ?`)
    .bind(
      input.name,
      input.role,
      roleTitle(input.role),
      input.active ? 1 : 0,
      credential.salt,
      credential.passwordHash,
      now,
      input.id,
    )
    .run();
  if (!input.active || input.password) {
    await database()
      .prepare("DELETE FROM portal_sessions WHERE user_id = ?")
      .bind(input.id)
      .run();
  }
  return getManagedUser(input.id);
}

export async function countActiveAdministrators() {
  await ensureIdentitySchema();
  const row = await database()
    .prepare(
      "SELECT COUNT(*) AS total FROM portal_users WHERE role = 'administrador' AND active = 1 AND deleted_at IS NULL",
    )
    .first<{ total: number }>();
  return Number(row?.total || 0);
}

export async function validManagedUserId(id: string) {
  await ensureIdentitySchema();
  const row = await database()
    .prepare("SELECT id FROM portal_users WHERE id = ? AND active = 1 AND deleted_at IS NULL LIMIT 1")
    .bind(id)
    .first<{ id: string }>();
  return Boolean(row);
}

export async function softDeleteManagedUser(id: string, actorId: string) {
  await ensureIdentitySchema();
  const deletedAt = new Date().toISOString();
  const result = await database()
    .prepare(`UPDATE portal_users
      SET active = 0, deleted_at = ?, deleted_by = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL`)
    .bind(deletedAt, actorId, deletedAt, id)
    .run();
  if (Number(result.meta.changes || 0) === 0) return false;
  await database()
    .prepare("DELETE FROM portal_sessions WHERE user_id = ?")
    .bind(id)
    .run();
  return true;
}

function sessionToken(request: Request) {
  const cookies = request.headers.get("cookie") || "";
  const encoded = cookies
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

export async function createSession(user: DemoUser) {
  await ensureIdentitySchema();
  const token = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + SESSION_TTL_SECONDS * 1000,
  ).toISOString();
  await database().batch([
    database()
      .prepare("DELETE FROM portal_sessions WHERE expires_at <= ?")
      .bind(now.toISOString()),
    database()
      .prepare(
        "INSERT INTO portal_sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
      )
      .bind(token, user.id, expiresAt, now.toISOString()),
    database()
      .prepare("UPDATE portal_users SET last_login_at = ? WHERE id = ?")
      .bind(now.toISOString(), user.id),
  ]);
  return token;
}

export async function revokeSession(request: Request) {
  const token = sessionToken(request);
  if (!token) return;
  await ensureIdentitySchema();
  await database()
    .prepare("DELETE FROM portal_sessions WHERE token = ?")
    .bind(token)
    .run();
}

export async function sessionUser(request: Request) {
  const token = sessionToken(request);
  if (!token) return null;
  await ensureIdentitySchema();
  const now = new Date().toISOString();
  const row = await database()
    .prepare(`SELECT u.* FROM portal_sessions s
      INNER JOIN portal_users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > ? AND u.active = 1 AND u.deleted_at IS NULL
      LIMIT 1`)
    .bind(token, now)
    .first<UserRow>();
  if (!row) {
    await database()
      .prepare("DELETE FROM portal_sessions WHERE token = ?")
      .bind(token)
      .run();
    return null;
  }
  return toDemoUser(row);
}

export function isSecureRequest(request: Request) {
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  return new URL(request.url).protocol === "https:" || forwardedProtocol === "https";
}

export function canManageCatalog(role: DemoRole) {
  return role === "gestor" || role === "administrador";
}

export function canManageAnyOccurrence(role: DemoRole) {
  return role === "gestor" || role === "administrador";
}
