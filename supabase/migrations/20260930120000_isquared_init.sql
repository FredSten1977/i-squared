-- I-Squared Statsbygg – database i Supabase.
--
-- Tabeller
--   isq_doc     arrangementsdokumentet (én rad). Kun Edge Function (service role).
--   isq_live    offentlig «stemmekatalog» for publikumsmobilene (én rad). Alle kan lese.
--   isq_tick    endringsteller (ver = dokument, cver = stemmer). Alle kan lese. Brukes til sanntidsvarsler.
--   isq_votes   anonyme stemmer (HMAC av voter-token, aldri selve tokenet). Ingen direkte tilgang.
--   isq_kv      innlogginger, PIN-hash, begrensninger og skjermstatus. Ingen direkte tilgang.
--   isq_log     revisjonslogg. Ingen direkte tilgang.
--   isq_secret  hemmelig salt for HMAC. Ingen direkte tilgang.
--
-- Publikum stemmer via isq_cast_vote (security definer). Alt annet går via Edge Function «isq».

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.isq_doc (
  id int primary key default 1 check (id = 1),
  ver bigint not null,
  doc jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.isq_live (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.isq_tick (
  id int primary key default 1 check (id = 1),
  ver bigint not null default 0,
  cver bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.isq_votes (
  poll_id text not null check (poll_id ~ '^[a-z0-9-]{1,20}$'),
  voter_hash text not null,
  choice text not null check (choice in ('against', 'neutral', 'for')),
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (poll_id, voter_hash)
);

create table if not exists public.isq_kv (
  key text primary key,
  value text not null,
  expires_at timestamptz
);

create table if not exists public.isq_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text,
  action text,
  payload jsonb
);

create table if not exists public.isq_secret (
  id int primary key default 1 check (id = 1),
  salt text not null
);

insert into public.isq_secret (id, salt) values (1, encode(extensions.gen_random_bytes(32), 'hex')) on conflict (id) do nothing;
insert into public.isq_tick (id) values (1) on conflict (id) do nothing;
insert into public.isq_live (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Tilgang: RLS på alt. Publikum kan bare lese isq_live og isq_tick.
-- ---------------------------------------------------------------------------
alter table public.isq_doc enable row level security;
alter table public.isq_live enable row level security;
alter table public.isq_tick enable row level security;
alter table public.isq_votes enable row level security;
alter table public.isq_kv enable row level security;
alter table public.isq_log enable row level security;
alter table public.isq_secret enable row level security;

revoke all on public.isq_doc, public.isq_votes, public.isq_kv, public.isq_log, public.isq_secret from anon, authenticated;
revoke all on public.isq_live, public.isq_tick from anon, authenticated;
grant select on public.isq_live, public.isq_tick to anon, authenticated;
revoke all on sequence public.isq_log_id_seq from anon, authenticated;

drop policy if exists "Alle kan lese stemmekatalogen" on public.isq_live;
create policy "Alle kan lese stemmekatalogen" on public.isq_live for select to anon, authenticated using (true);
drop policy if exists "Alle kan lese endringstelleren" on public.isq_tick;
create policy "Alle kan lese endringstelleren" on public.isq_tick for select to anon, authenticated using (true);

-- Sanntid: endringer i katalogen og telleren sendes til skjerm, kontrollflate og mobiler
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'isq_live') then
    alter publication supabase_realtime add table public.isq_live;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'isq_tick') then
    alter publication supabase_realtime add table public.isq_tick;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- HMAC (samme resultat som motoren: base64url uten polstring)
-- ---------------------------------------------------------------------------
create or replace function public.isq_hmac(p_text text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select rtrim(translate(encode(extensions.hmac(convert_to(p_text, 'UTF8'), convert_to(s.salt, 'UTF8'), 'sha256'), 'base64'), '+/', '-_'), '=')
  from public.isq_secret s
  where s.id = 1
$$;

-- ---------------------------------------------------------------------------
-- Stemmegivning fra publikum (eneste skrivetilgang for anon)
-- ---------------------------------------------------------------------------
create or replace function public.isq_cast_vote(p_token text, p_poll_id text, p_choice text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_hash text;
  v_prev text;
  v_result text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{16,128}$' then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Ugyldige data: token');
  end if;
  if p_choice is null or p_choice not in ('against', 'neutral', 'for') then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Ugyldige data: choice');
  end if;
  if p_poll_id is null or p_poll_id !~ '^[a-z0-9-]{1,20}$' then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Ugyldige data: pollId');
  end if;
  -- Delt lås: en avstemning som lukkes, venter til stemmer som er på vei er lagret
  select l.data -> 'polls' -> p_poll_id ->> 'status' into v_status from public.isq_live l where l.id = 1 for share;
  if v_status is distinct from 'open' then
    return jsonb_build_object('ok', false, 'code', 'POLL_CLOSED', 'error', 'Avstemningen er ikke åpen.');
  end if;
  v_hash := public.isq_hmac('voter:' || p_token);
  select v.choice into v_prev from public.isq_votes v where v.poll_id = p_poll_id and v.voter_hash = v_hash;
  if v_prev = p_choice then
    v_result := 'unchanged';
  else
    insert into public.isq_votes (poll_id, voter_hash, choice)
    values (p_poll_id, v_hash, p_choice)
    on conflict (poll_id, voter_hash) do update set choice = excluded.choice, demo = false, updated_at = now();
    v_result := case when v_prev is null then 'created' else 'updated' end;
    update public.isq_tick set cver = cver + 1, updated_at = now() where id = 1;
  end if;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('result', v_result, 'pollId', p_poll_id, 'choice', p_choice));
end;
$$;

-- ---------------------------------------------------------------------------
-- For Edge Function: les alt motoren trenger i ett kall
-- ---------------------------------------------------------------------------
create or replace function public.isq_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ver', (select d.ver from public.isq_doc d where d.id = 1),
    'doc', (select d.doc from public.isq_doc d where d.id = 1),
    'live', (select l.data from public.isq_live l where l.id = 1),
    'salt', (select s.salt from public.isq_secret s where s.id = 1),
    'counts', coalesce((
      select jsonb_agg(jsonb_build_object('p', x.poll_id, 'c', x.choice, 'n', x.n, 'd', x.d))
      from (
        select v.poll_id, v.choice, count(*) as n, count(*) filter (where v.demo) as d
        from public.isq_votes v
        group by v.poll_id, v.choice
      ) x
    ), '[]'::jsonb),
    'kv', coalesce((
      select jsonb_object_agg(k.key, k.value) from public.isq_kv k where k.expires_at is null or k.expires_at > now()
    ), '{}'::jsonb),
    'log', coalesce((
      select jsonb_agg(jsonb_build_object('at', g.at, 'actor', g.actor, 'action', g.action, 'payload', g.payload) order by g.id desc)
      from (select * from public.isq_log order by id desc limit 25) g
    ), '[]'::jsonb)
  )
$$;

-- Lagrer en endring fra motoren i én transaksjon (optimistisk samtidighet på dokumentet)
create or replace function public.isq_commit(p_base_ver bigint, p_doc jsonb, p_live jsonb, p_ops jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op jsonb;
  v_rows int;
  v_votes boolean := false;
begin
  if p_doc is not null then
    if p_base_ver is null then
      insert into public.isq_doc (id, ver, doc) values (1, coalesce((p_doc ->> 'version')::bigint, 0), p_doc) on conflict (id) do nothing;
    else
      update public.isq_doc
      set doc = p_doc, ver = coalesce((p_doc ->> 'version')::bigint, ver + 1), updated_at = now()
      where id = 1 and ver = p_base_ver;
    end if;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise exception 'ISQ_CONFLICT' using errcode = '40001';
    end if;
  end if;

  if p_live is not null then
    update public.isq_live set data = p_live, updated_at = now() where id = 1 and data is distinct from p_live;
  end if;

  for op in select value from jsonb_array_elements(coalesce(p_ops, '[]'::jsonb)) loop
    case op ->> 't'
      when 'kvset' then
        insert into public.isq_kv (key, value, expires_at)
        values (op ->> 'k', op ->> 'v', case when op ? 'ttl' then now() + make_interval(secs => (op ->> 'ttl')::int) end)
        on conflict (key) do update set value = excluded.value, expires_at = excluded.expires_at;
      when 'kvdel' then
        delete from public.isq_kv where key = op ->> 'k';
      when 'log' then
        insert into public.isq_log (at, actor, action, payload)
        values (coalesce((op ->> 'at')::timestamptz, now()), op ->> 'actor', op ->> 'action', op -> 'payload');
      when 'clear' then
        delete from public.isq_votes v
        where (op ->> 'poll' is null or v.poll_id = op ->> 'poll')
          and (not coalesce((op ->> 'demoOnly')::boolean, false) or v.demo);
        v_votes := true;
      when 'bulk' then
        insert into public.isq_votes (poll_id, voter_hash, choice, demo)
        select op ->> 'poll', e ->> 'hash', e ->> 'choice', coalesce((e ->> 'demo')::boolean, false)
        from jsonb_array_elements(op -> 'list') e
        on conflict (poll_id, voter_hash) do update set choice = excluded.choice, demo = excluded.demo, updated_at = now();
        v_votes := true;
      when 'vote' then
        insert into public.isq_votes (poll_id, voter_hash, choice, demo)
        values (op ->> 'poll', op ->> 'hash', op ->> 'choice', coalesce((op ->> 'demo')::boolean, false))
        on conflict (poll_id, voter_hash) do update set choice = excluded.choice, demo = excluded.demo, updated_at = now();
        v_votes := true;
      else
        null;
    end case;
  end loop;

  delete from public.isq_kv where expires_at < now() - interval '10 minutes';

  if p_doc is not null or v_votes then
    update public.isq_tick
    set ver = ver + (case when p_doc is not null then 1 else 0 end),
        cver = cver + (case when v_votes then 1 else 0 end),
        updated_at = now()
    where id = 1;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Stenger avstemninger i katalogen før resultatet beregnes, slik at ingen stemmer kommer imellom
create or replace function public.isq_freeze(p_polls text[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pid text;
begin
  foreach pid in array coalesce(p_polls, array[]::text[]) loop
    update public.isq_live
    set data = jsonb_set(data, array['polls', pid, 'status'], '"closed"'::jsonb), updated_at = now()
    where id = 1 and data -> 'polls' ? pid;
  end loop;
end;
$$;

-- Setter administrator-PIN (kjøres i SQL Editor: select public.isq_set_admin_pin('din-pin');)
create or replace function public.isq_set_admin_pin(p_pin text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_pin is null or length(p_pin) < 6 then
    raise exception 'PIN må være minst 6 tegn.';
  end if;
  insert into public.isq_kv (key, value) values ('ADMIN_PIN_HASH', public.isq_hmac('pin:' || p_pin))
  on conflict (key) do update set value = excluded.value, expires_at = null;
  delete from public.isq_kv where key like 'SESS\_%' or key like 'sess:%';
  return 'PIN er satt. Alle eksisterende innlogginger er logget ut.';
end;
$$;

-- Lesbar rapport (Table Editor / SQL Editor): stemmer per avstemning
create or replace view public.isq_rapport_stemmer with (security_invoker = true) as
select poll_id as avstemning,
       count(*) filter (where choice = 'against') as mot,
       count(*) filter (where choice = 'neutral') as noytral,
       count(*) filter (where choice = 'for') as for_,
       count(*) as totalt,
       count(*) filter (where demo) as demo
from public.isq_votes
group by poll_id
order by poll_id;
revoke all on public.isq_rapport_stemmer from anon, authenticated;

-- Rettigheter på funksjoner
revoke execute on function public.isq_hmac(text) from public, anon, authenticated;
revoke execute on function public.isq_snapshot() from public, anon, authenticated;
revoke execute on function public.isq_commit(bigint, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.isq_freeze(text[]) from public, anon, authenticated;
revoke execute on function public.isq_set_admin_pin(text) from public, anon, authenticated;
revoke execute on function public.isq_cast_vote(text, text, text) from public;
grant execute on function public.isq_cast_vote(text, text, text) to anon, authenticated;
grant execute on function public.isq_snapshot() to service_role;
grant execute on function public.isq_commit(bigint, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.isq_freeze(text[]) to service_role;
grant execute on function public.isq_hmac(text) to service_role;
