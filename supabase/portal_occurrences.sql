-- Estrutura PostgreSQL/Supabase versionada para novos ambientes.
-- Em ambientes existentes, execute primeiro audit_occurrence_dates.sql.
-- Este arquivo não corrige nem reinterpreta registros históricos.

create schema if not exists suporte;
create sequence if not exists suporte.portal_occurrence_number_seq;

create table if not exists suporte.portal_occurrences (
  id text primary key,
  number text not null default ('OCO-' || nextval('suporte.portal_occurrence_number_seq')::text),
  client_id text not null default '',
  other_client text,
  system_id text not null,
  module_id text not null,
  catalog_item_id text,
  other_error text,
  description text not null default '',
  severity text not null check (severity in ('Baixa', 'Média', 'Alta', 'Crítica')),
  occurred_at timestamptz not null,
  status text not null default 'Novo' check (status in ('Novo', 'Em análise', 'Aguardando', 'Resolvido', 'Cancelado')),
  responsible_id text not null,
  author_id text not null,
  attachments_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by text,
  constraint portal_occurrences_number_unique unique (number),
  constraint portal_occurrences_client_check check (client_id <> '' or nullif(btrim(other_client), '') is not null)
);

create index if not exists portal_occurrences_active_updated_idx
  on suporte.portal_occurrences (deleted_at, updated_at desc);
create index if not exists portal_occurrences_responsible_idx
  on suporte.portal_occurrences (responsible_id);
create index if not exists portal_occurrences_occurred_idx
  on suporte.portal_occurrences (occurred_at desc) where deleted_at is null;

grant usage on schema suporte to service_role;
grant usage, select on sequence suporte.portal_occurrence_number_seq to service_role;
grant select, insert, update, delete on table suporte.portal_occurrences to service_role;
