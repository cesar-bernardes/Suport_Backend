-- Adiciona a urgência às ações existentes sem apagar ou recriar registros.
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

notify pgrst, 'reload schema';
