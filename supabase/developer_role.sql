-- Libera o terceiro perfil de acesso usado pelo portal.
-- Pode ser executado mais de uma vez no SQL Editor do Supabase.

do $$
declare
  role_attribute smallint;
  constraint_record record;
begin
  select attribute.attnum
    into role_attribute
  from pg_attribute as attribute
  join pg_class as relation
    on relation.oid = attribute.attrelid
  join pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'suporte'
    and relation.relname = 'portal_users'
    and attribute.attname = 'role'
    and not attribute.attisdropped;

  if role_attribute is null then
    raise exception 'A coluna suporte.portal_users.role não foi encontrada.';
  end if;

  for constraint_record in
    select constraint_definition.conname
    from pg_constraint as constraint_definition
    join pg_class as relation
      on relation.oid = constraint_definition.conrelid
    join pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'suporte'
      and relation.relname = 'portal_users'
      and constraint_definition.contype = 'c'
      and role_attribute = any (constraint_definition.conkey)
  loop
    execute format(
      'alter table suporte.portal_users drop constraint %I',
      constraint_record.conname
    );
  end loop;
end
$$;

alter table suporte.portal_users
  add constraint portal_users_role_check
  check (role in ('suporte', 'desenvolvedor', 'administrador'));

comment on constraint portal_users_role_check on suporte.portal_users is
  'Perfis de acesso aceitos pelo Portal de Ocorrências e Suporte.';
