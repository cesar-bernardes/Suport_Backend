-- Vincula as ações de desenvolvimento aos Sistemas e Módulos reais do Catálogo.
-- As colunas permanecem opcionais para preservar ações antigas; a API exige
-- ambos os campos ao criar uma nova ação.
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

create index if not exists development_actions_reference_idx
  on suporte.development_actions (system_id, module_id);

notify pgrst, 'reload schema';
