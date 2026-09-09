alter table suporte.portal_occurrences
  add column if not exists other_client text;

comment on column suporte.portal_occurrences.other_client is
  'Nome livre de pessoa ou identificação usado quando a ocorrência não pertence a uma empresa cadastrada.';
