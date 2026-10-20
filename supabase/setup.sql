-- BSc AI Practice: anonymous live counter + site-wide activity totals.
-- Paste into Supabase > SQL Editor > New query, then click Run. Safe to run more than once.
-- Stores no names, emails or IP addresses: only daily totals and a random per-tab id that expires after 2 minutes.

-- One row per day per course ('site' holds sessions and the busiest moment).
create table if not exists public.daily_stats (
  day         date    not null,
  course      text    not null check (course in ('site', 'ai', 'psy')),
  answered    integer not null default 0,
  correct     integer not null default 0,
  sessions    integer not null default 0,
  peak_online integer not null default 0,
  primary key (day, course)
);

-- Open tabs seen in the last 2 minutes.
create table if not exists public.online_now (
  id        uuid        primary key,
  course    text        not null default 'site',
  last_seen timestamptz not null default now()
);

alter table public.daily_stats enable row level security;
alter table public.online_now  enable row level security;

-- Anyone may read the totals. Nobody may write tables directly: only the functions below change data.
grant select on public.daily_stats to anon, authenticated;
drop policy if exists "Stats are public" on public.daily_stats;
create policy "Stats are public" on public.daily_stats for select to anon, authenticated using (true);

create or replace function public.today_ams() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Europe/Amsterdam')::date
$$;

-- +1 to today's total for a course.
create or replace function public.record_answer(p_course text, p_correct boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_course not in ('ai', 'psy') then return; end if;
  insert into daily_stats (day, course, answered, correct)
  values (today_ams(), p_course, 1, case when p_correct then 1 else 0 end)
  on conflict (day, course) do update
    set answered = daily_stats.answered + 1,
        correct  = daily_stats.correct + excluded.correct;
end $$;

-- Called by each open tab about once a minute. Returns how many tabs are open right now.
create or replace function public.heartbeat(p_id uuid, p_course text, p_new_session boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_course text := case when p_course in ('ai', 'psy') then p_course else 'site' end;
  v_total int; v_ai int; v_psy int;
begin
  delete from online_now where last_seen < now() - interval '2 minutes';
  insert into online_now (id, course, last_seen) values (p_id, v_course, now())
  on conflict (id) do update set course = excluded.course, last_seen = now();
  select count(*), count(*) filter (where course = 'ai'), count(*) filter (where course = 'psy')
    into v_total, v_ai, v_psy
    from online_now;
  insert into daily_stats (day, course, sessions, peak_online)
  values (today_ams(), 'site', case when p_new_session then 1 else 0 end, v_total)
  on conflict (day, course) do update
    set sessions    = daily_stats.sessions + excluded.sessions,
        peak_online = greatest(daily_stats.peak_online, excluded.peak_online);
  return json_build_object('online', v_total, 'ai', v_ai, 'psy', v_psy);
end $$;

-- Tab closed: remove it from the live count straight away.
create or replace function public.leave(p_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from online_now where id = p_id
$$;

revoke all on function public.record_answer(text, boolean)       from public;
revoke all on function public.heartbeat(uuid, text, boolean)     from public;
revoke all on function public.leave(uuid)                        from public;
grant execute on function public.record_answer(text, boolean)    to anon, authenticated;
grant execute on function public.heartbeat(uuid, text, boolean)  to anon, authenticated;
grant execute on function public.leave(uuid)                     to anon, authenticated;
