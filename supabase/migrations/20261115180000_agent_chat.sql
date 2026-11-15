-- Revisar antes de aplicar. No se ejecuta desde el chat ni al arrancar Next.js.
-- La API pública accede solo a través del servidor; nunca recibe service_role.
set search_path = public, extensions;

create table public.agent_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.agent_sessions(id) on delete set null,
  trigger text not null default 'user_chat' check (trigger in ('incident', 'user_chat', 'schedule')),
  user_id uuid,
  incident_id uuid,
  provider text not null,
  model text not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'cancelled')),
  ip_hash text check (ip_hash ~ '^[a-f0-9]{64}$'),
  tokens_in integer check (tokens_in >= 0),
  tokens_out integer check (tokens_out >= 0),
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index agent_runs_session_idx on public.agent_runs(session_id, started_at desc);
create index agent_runs_rate_idx on public.agent_runs(ip_hash, started_at desc);

create table public.agent_messages (
  id bigserial primary key,
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  role text not null check (role in ('system', 'user', 'assistant', 'tool')),
  content jsonb not null,
  created_at timestamptz not null default now()
);
create index agent_messages_run_idx on public.agent_messages(run_id, id);

create table public.agent_tool_calls (
  id bigserial primary key,
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  tool text not null,
  input jsonb not null,
  output jsonb,
  has_side_effect boolean not null default false,
  policy_decision text not null check (policy_decision in ('allowed', 'needs_approval', 'denied')),
  created_at timestamptz not null default now()
);
create index agent_tool_calls_run_idx on public.agent_tool_calls(run_id, id);

alter table public.agent_sessions enable row level security;
alter table public.agent_runs enable row level security;
alter table public.agent_messages enable row level security;
alter table public.agent_tool_calls enable row level security;
revoke all on public.agent_sessions, public.agent_runs, public.agent_messages, public.agent_tool_calls from public;
revoke all on sequence public.agent_messages_id_seq, public.agent_tool_calls_id_seq from public;

-- Una sola transacción evita que dos instancias salten cuotas o ejecuten a la vez
-- un turno de la misma sesión. Las claves son hashes; nunca IP/cookie en claro.
create function public.agent_open_chat(
  p_token_hash text, p_ip_hash text, p_provider text, p_model text,
  p_expected_session_id uuid default null
) returns table(id uuid, session_id uuid, provider text, model text)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_session uuid;
  v_run uuid;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' or p_ip_hash !~ '^[a-f0-9]{64}$'
     or p_provider not in ('meta', 'mock') or length(p_model) not between 1 and 100 then
    raise exception 'INVALID_REQUEST';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('agent-ip:' || p_ip_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended('agent-session:' || p_token_hash, 0));
  select s.id into v_session from public.agent_sessions s
    where s.token_hash = p_token_hash and s.last_seen_at > now() - interval '30 days';
  if p_expected_session_id is not null and p_expected_session_id is distinct from v_session then
    raise exception 'SESSION_MISMATCH';
  end if;
  if (select count(*) from public.agent_runs r where r.ip_hash = p_ip_hash and r.started_at > now() - interval '1 minute') >= 10
     or (select count(*) from public.agent_runs r where r.ip_hash = p_ip_hash and r.started_at > now() - interval '1 hour') >= 60
     or (select count(*) from public.agent_runs r where r.session_id = v_session and r.started_at > now() - interval '1 minute') >= 10 then
    raise exception 'RATE_LIMITED';
  end if;
  if exists (select 1 from public.agent_runs r where r.session_id = v_session and r.status = 'running' and r.started_at > now() - interval '70 seconds') then
    raise exception 'SESSION_BUSY';
  end if;
  if v_session is null then
    delete from public.agent_sessions s where s.token_hash = p_token_hash;
    insert into public.agent_sessions(token_hash) values(p_token_hash) returning agent_sessions.id into v_session;
  else
    update public.agent_sessions s set last_seen_at = now() where s.id = v_session;
  end if;
  update public.agent_runs r set status = 'failed', error_code = 'TURN_INTERRUPTED', finished_at = now()
    where r.session_id = v_session and r.status = 'running';
  insert into public.agent_runs(session_id, provider, model, ip_hash)
    values(v_session, p_provider, p_model, p_ip_hash) returning agent_runs.id into v_run;
  return query select v_run, v_session, p_provider, p_model;
end;
$$;

create function public.agent_chat_history(p_session_id uuid)
returns table(role text, content jsonb)
language sql stable security invoker set search_path = public, pg_temp as $$
  select history.role, history.content from (
    select m.id, m.role, m.content
    from public.agent_messages m join public.agent_runs r on r.id = m.run_id
    where r.session_id = p_session_id and r.status = 'completed'
      and m.role in ('user', 'assistant') and not (m.content ? 'toolCalls')
      and m.created_at > now() - interval '30 days'
    order by m.id desc limit 12
  ) history order by history.id;
$$;

-- Ejecutar manualmente o desde un job de retención aprobado, nunca automáticamente
-- durante esta entrega. El texto anónimo dura 30 días; auditoría estructurada 1 año.
create function public.agent_apply_retention()
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  delete from public.agent_messages m using public.agent_runs r
    where m.run_id = r.id and r.user_id is null and m.created_at < now() - interval '30 days';
  update public.agent_runs set ip_hash = null where ip_hash is not null and started_at < now() - interval '1 day';
  delete from public.agent_sessions where last_seen_at < now() - interval '30 days';
  delete from public.agent_runs where started_at < now() - interval '1 year';
end;
$$;

revoke all on function public.agent_open_chat(text,text,text,text,uuid) from public;
revoke all on function public.agent_chat_history(uuid) from public;
revoke all on function public.agent_apply_retention() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.agent_sessions, public.agent_runs, public.agent_messages, public.agent_tool_calls from anon;
    revoke all on sequence public.agent_messages_id_seq, public.agent_tool_calls_id_seq from anon;
    revoke all on function public.agent_open_chat(text,text,text,text,uuid) from anon;
    revoke all on function public.agent_chat_history(uuid) from anon;
    revoke all on function public.agent_apply_retention() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.agent_sessions, public.agent_runs, public.agent_messages, public.agent_tool_calls from authenticated;
    revoke all on sequence public.agent_messages_id_seq, public.agent_tool_calls_id_seq from authenticated;
    revoke all on function public.agent_open_chat(text,text,text,text,uuid) from authenticated;
    revoke all on function public.agent_chat_history(uuid) from authenticated;
    revoke all on function public.agent_apply_retention() from authenticated;
    grant select on public.agent_runs, public.agent_messages, public.agent_tool_calls to authenticated;
    -- app_metadata es administrado por el servidor de Auth, no por el usuario.
    create policy agent_runs_review on public.agent_runs for select to authenticated using (
      coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb -> 'app_metadata' ->> 'role' in ('coordinator','admin')
      or user_id::text = coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'sub'
    );
    create policy agent_messages_review on public.agent_messages for select to authenticated using (
      exists (select 1 from public.agent_runs r where r.id = run_id)
    );
    create policy agent_tool_calls_review on public.agent_tool_calls for select to authenticated using (
      exists (select 1 from public.agent_runs r where r.id = run_id)
    );
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on public.agent_sessions, public.agent_runs, public.agent_messages, public.agent_tool_calls to service_role;
    grant usage, select on sequence public.agent_messages_id_seq, public.agent_tool_calls_id_seq to service_role;
    grant execute on function public.agent_open_chat(text,text,text,text,uuid) to service_role;
    grant execute on function public.agent_chat_history(uuid) to service_role;
    grant execute on function public.agent_apply_retention() to service_role;
  end if;
end
$$;
