-- Oculta somente os registros criados pelas antigas cargas de demonstracao.
-- O historico permanece no schema suporte por meio de exclusao logica.

begin;

update suporte.portal_users
set active = false,
    deleted_at = coalesce(deleted_at, now()),
    deleted_by = coalesce(deleted_by, 'system-demo-cleanup'),
    updated_at = now()
where id in ('u1', 'u2', 'u3')
  and deleted_at is null;

update suporte.portal_occurrences
set deleted_at = coalesce(deleted_at, now()),
    deleted_by = coalesce(deleted_by, 'system-demo-cleanup'),
    updated_at = now()
where id in ('o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8', 'o9', 'o10', 'o11', 'o12')
  and deleted_at is null;

update suporte.portal_agenda_entries
set deleted_at = coalesce(deleted_at, now()),
    deleted_by = coalesce(deleted_by, 'system-demo-cleanup'),
    updated_at = now()
where id in ('agenda-demo-1', 'agenda-demo-2')
  and deleted_at is null;

update suporte.catalog_items
set active = false, deleted_at = coalesce(deleted_at, now()), updated_at = now()
where id in ('c1', 'c2', 'c3', 'c4', 'c5', 'c6') and deleted_at is null;

update suporte.clients
set active = false, deleted_at = coalesce(deleted_at, now()), updated_at = now()
where id in ('cl1', 'cl2', 'cl3', 'cl4', 'cl5') and deleted_at is null;

update suporte.systems
set active = false, deleted_at = coalesce(deleted_at, now()), updated_at = now()
where id in ('s1', 's2', 's3') and deleted_at is null;

update suporte.modules
set active = false, deleted_at = coalesce(deleted_at, now()), updated_at = now()
where id in ('m1', 'm2', 'm3', 'm4', 'm5', 'm6') and deleted_at is null;

commit;
