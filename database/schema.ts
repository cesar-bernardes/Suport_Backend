import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const portalUsers = sqliteTable(
  "portal_users",
  {
    id: text("id").primaryKey().notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailNormalized: text("email_normalized").notNull(),
    usernameNormalized: text("username_normalized").notNull(),
    role: text("role", {
      enum: ["suporte", "desenvolvedor", "administrador"],
    }).notNull(),
    title: text("title").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    passwordSalt: text("password_salt").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastLoginAt: text("last_login_at"),
    deletedAt: text("deleted_at"),
    deletedBy: text("deleted_by"),
  },
  (table) => [
    uniqueIndex("portal_users_email_normalized_unique").on(
      table.emailNormalized,
    ),
    uniqueIndex("portal_users_username_normalized_unique").on(
      table.usernameNormalized,
    ),
    index("portal_users_role_active_idx").on(table.role, table.active),
  ],
);

export const portalOccurrences = sqliteTable(
  "portal_occurrences",
  {
    id: text("id").primaryKey().notNull(),
    number: text("number").notNull(),
    clientId: text("client_id").notNull(),
    systemId: text("system_id").notNull(),
    moduleId: text("module_id").notNull(),
    catalogItemId: text("catalog_item_id"),
    otherError: text("other_error"),
    description: text("description").notNull(),
    severity: text("severity").notNull(),
    occurredAt: text("occurred_at").notNull(),
    status: text("status").notNull(),
    responsibleId: text("responsible_id").notNull(),
    authorId: text("author_id").notNull(),
    attachmentsJson: text("attachments_json").notNull().default("[]"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
    deletedBy: text("deleted_by"),
  },
  (table) => [
    uniqueIndex("portal_occurrences_number_unique").on(table.number),
    index("portal_occurrences_active_updated_idx").on(
      table.deletedAt,
      table.updatedAt,
    ),
    index("portal_occurrences_responsible_idx").on(table.responsibleId),
  ],
);

export const portalAgendaEntries = sqliteTable(
  "portal_agenda_entries",
  {
    id: text("id").primaryKey().notNull(),
    type: text("type", {
      enum: ["agendado", "inesperado", "interno"],
    }).notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    clientId: text("client_id"),
    assigneeId: text("assignee_id").notNull(),
    createdBy: text("created_by").notNull(),
    scheduledStart: text("scheduled_start"),
    estimatedMinutes: integer("estimated_minutes"),
    status: text("status", {
      enum: ["planejado", "em_andamento", "concluido", "cancelado"],
    }).notNull(),
    actualStart: text("actual_start"),
    actualEnd: text("actual_end"),
    outcome: text("outcome"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
    deletedBy: text("deleted_by"),
  },
  (table) => [
    index("portal_agenda_assignee_start_idx").on(
      table.assigneeId,
      table.scheduledStart,
    ),
    index("portal_agenda_active_status_idx").on(table.deletedAt, table.status),
  ],
);

export const portalSessions = sqliteTable(
  "portal_sessions",
  {
    token: text("token").primaryKey().notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => portalUsers.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("portal_sessions_user_id_idx").on(table.userId),
    index("portal_sessions_expires_at_idx").on(table.expiresAt),
  ],
);
