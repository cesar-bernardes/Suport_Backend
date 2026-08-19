-- Arquivamento reversível de ações concluídas, visível somente aos Administradores.
alter table suporte.development_actions
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text;

do $$
begin
  alter table suporte.development_actions
    add constraint development_actions_archived_by_fkey
    foreign key (archived_by) references suporte.portal_users(id);
exception
  when duplicate_object then null;
end $$;

alter table suporte.development_actions
  drop constraint if exists development_actions_status_check;

alter table suporte.development_actions
  add constraint development_actions_status_check
  check (status in (
    'Encaminhada',
    'Em análise',
    'Em desenvolvimento',
    'Aguardando validação',
    'Reprovada',
    'Resolvida'
  ));

create index if not exists development_actions_archive_idx
  on suporte.development_actions (archived_at, status);

notify pgrst, 'reload schema';
