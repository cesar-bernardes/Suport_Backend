-- Rate limit persistente para ambientes serverless.
-- Execute antes de habilitar PERSISTENT_LOGIN_RATE_LIMIT no backend.

create schema if not exists suporte;

create table if not exists suporte.portal_login_attempts (
  client_key text primary key,
  failures integer not null default 0 check (failures >= 0),
  window_started_at timestamptz not null,
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists portal_login_attempts_cleanup_idx on suporte.portal_login_attempts (updated_at);

create or replace function suporte.register_portal_login_failure(
  p_client_key text,
  p_now timestamptz,
  p_window_seconds integer,
  p_max_failures integer,
  p_block_seconds integer
)
returns table (failures integer, window_started_at timestamptz, blocked_until timestamptz)
language plpgsql
security definer
set search_path = suporte, public
as $$
declare
  current_attempt suporte.portal_login_attempts%rowtype;
begin
  insert into suporte.portal_login_attempts (client_key, failures, window_started_at, blocked_until, updated_at)
  values (p_client_key, 0, p_now, null, p_now)
  on conflict (client_key) do nothing;

  select * into current_attempt
  from suporte.portal_login_attempts
  where client_key = p_client_key
  for update;

  if current_attempt.blocked_until is not null and current_attempt.blocked_until > p_now then
    return query select current_attempt.failures, current_attempt.window_started_at, current_attempt.blocked_until;
    return;
  end if;

  if current_attempt.window_started_at <= p_now - make_interval(secs => p_window_seconds) then
    current_attempt.failures := 1;
    current_attempt.window_started_at := p_now;
  else
    current_attempt.failures := current_attempt.failures + 1;
  end if;

  if current_attempt.failures >= p_max_failures then
    current_attempt.blocked_until := p_now + make_interval(secs => p_block_seconds);
  else
    current_attempt.blocked_until := null;
  end if;

  update suporte.portal_login_attempts
  set failures = current_attempt.failures,
      window_started_at = current_attempt.window_started_at,
      blocked_until = current_attempt.blocked_until,
      updated_at = p_now
  where client_key = p_client_key;

  return query select current_attempt.failures, current_attempt.window_started_at, current_attempt.blocked_until;
end;
$$;

revoke all on table suporte.portal_login_attempts from public, anon, authenticated;
revoke all on function suporte.register_portal_login_failure(text, timestamptz, integer, integer, integer) from public, anon, authenticated;
grant select, insert, update, delete on table suporte.portal_login_attempts to service_role;
grant execute on function suporte.register_portal_login_failure(text, timestamptz, integer, integer, integer) to service_role;
