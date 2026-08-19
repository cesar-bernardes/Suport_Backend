-- Execute developer_role.sql antes deste arquivo para liberar o perfil
-- "desenvolvedor" em suporte.portal_users.

create table if not exists suporte.development_actions (
  id text primary key,
  number text not null unique,
  title text not null,
  problem_description text not null,
  action_plan text not null,
  analysis_information text not null default '',
  identified_at timestamptz not null,
  support_id text not null references suporte.portal_users(id),
  developer_id text not null references suporte.portal_users(id),
  system_id text references suporte.systems(id),
  module_id text references suporte.modules(id),
  urgency text not null default 'Médio' check (urgency in ('Leve', 'Médio', 'Urgente')),
  due_at timestamptz,
  status text not null default 'Encaminhada' check (
    status in ('Encaminhada', 'Em análise', 'Em desenvolvimento', 'Aguardando validação', 'Reprovada', 'Resolvida')
  ),
  developer_notes text not null default '',
  resolution_notes text not null default '',
  evidence_json jsonb not null default '[]'::jsonb,
  resolved_at timestamptz,
  archived_at timestamptz,
  archived_by text references suporte.portal_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by text references suporte.portal_users(id)
);

-- Atualiza instalações existentes sem apagar nem recriar ações.
alter table suporte.development_actions
  add column if not exists urgency text;

update suporte.development_actions
set urgency = 'Médio'
where urgency is null;

alter table suporte.development_actions
  alter column urgency set default 'Médio',
  alter column urgency set not null;

do $$
begin
  alter table suporte.development_actions
    add constraint development_actions_urgency_check
    check (urgency in ('Leve', 'Médio', 'Urgente'));
exception
  when duplicate_object then null;
end $$;

-- Vincula novas ações aos Sistemas e Módulos reais do Catálogo.
alter table suporte.development_actions
  add column if not exists system_id text,
  add column if not exists module_id text;

do $$
begin
  alter table suporte.development_actions
    add constraint development_actions_system_id_fkey
    foreign key (system_id) references suporte.systems(id);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table suporte.development_actions
    add constraint development_actions_module_id_fkey
    foreign key (module_id) references suporte.modules(id);
exception
  when duplicate_object then null;
end $$;

create index if not exists development_actions_developer_idx
  on suporte.development_actions (developer_id, status, due_at);

create index if not exists development_actions_support_idx
  on suporte.development_actions (support_id, identified_at desc);

create index if not exists development_actions_active_idx
  on suporte.development_actions (deleted_at, updated_at desc);

create index if not exists development_actions_archive_idx
  on suporte.development_actions (archived_at, status);

create index if not exists development_actions_reference_idx
  on suporte.development_actions (system_id, module_id);

comment on table suporte.development_actions is
  'Ações encaminhadas pelo suporte para análise e correção pelos desenvolvedores.';

-- O backend usa a chave service_role e precisa de permissão explícita em schemas
-- personalizados. Estas concessões são idempotentes.
grant usage on schema suporte to service_role;
grant select, insert, update, delete
  on table suporte.development_actions
  to service_role;

-- Atualiza imediatamente o cache de estrutura utilizado pela API do Supabase.
notify pgrst, 'reload schema';
