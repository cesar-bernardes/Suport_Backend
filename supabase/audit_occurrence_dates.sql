-- Auditoria somente leitura. Este arquivo não altera registros.
-- Execute no SQL Editor do Supabase antes de considerar qualquer correção histórica.

select column_name, data_type, udt_name, column_default
from information_schema.columns
where table_schema = 'suporte'
  and table_name = 'portal_occurrences'
  and column_name in ('occurred_at', 'created_at', 'updated_at')
order by ordinal_position;

select id, number, occurred_at, created_at, updated_at
from suporte.portal_occurrences
where deleted_at is null
order by created_at desc;
