-- BSc AI Practice: count people over time (anonymously) + private views for the site owner.
-- Run AFTER setup.sql and study-record.sql: Supabase > SQL Editor > New query > paste > Run. Safe to run again.
--
-- Each browser gets a random visitor code (no name, email or IP address). Visitors can opt out on the dashboard.
-- The views live in a separate "admin" schema that the website's API can't reach: only you see them in Supabase.

-- One row per browser.
create table if not exists public.visitors (
  id          uuid        primary key,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  last_day    date        not null default public.today_ams(),
  days_active integer     not null default 1,
  sessions    integer     not null default 1,
  answers     integer     not null default 0,
  correct     integer     not null default 0
);
alter table public.visitors enable row level security;  -- no policies: only the functions below touch it

alter table public.daily_stats add column if not exists visitors     integer not null default 0;
alter table public.daily_stats add column if not exists new_visitors integer not null default 0;

-- Called once per visit (browser tab session).
create or replace function public.visit(p_visitor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_day    date := today_ams();
  v_last   date;
  v_new    boolean := false;
  v_newday boolean := false;
begin
  insert into visitors (id) values (p_visitor) on conflict (id) do nothing;
  if found then
    v_new := true; v_newday := true;
  else
    select last_day into v_last from visitors where id = p_visitor for update;
    v_newday := v_last < v_day;
    update visitors
       set last_seen = now(), sessions = sessions + 1, last_day = v_day,
           days_active = days_active + case when v_newday then 1 else 0 end
     where id = p_visitor;
  end if;
  if v_newday then
    insert into daily_stats (day, course, visitors, new_visitors)
    values (v_day, 'site', 1, case when v_new then 1 else 0 end)
    on conflict (day, course) do update
      set visitors = daily_stats.visitors + 1,
          new_visitors = daily_stats.new_visitors + excluded.new_visitors;
  end if;
end $$;

-- Same as before (+1 to today's total), now also adding to the visitor's own count.
drop function if exists public.record_answer(text, boolean);
create or replace function public.record_answer(p_course text, p_correct boolean, p_visitor uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_course not in ('ai', 'psy') then return; end if;
  insert into daily_stats (day, course, answered, correct)
  values (today_ams(), p_course, 1, case when p_correct then 1 else 0 end)
  on conflict (day, course) do update
    set answered = daily_stats.answered + 1,
        correct  = daily_stats.correct + excluded.correct;
  if p_visitor is not null then
    update visitors
       set answers = answers + 1, correct = correct + case when p_correct then 1 else 0 end, last_seen = now()
     where id = p_visitor;
  end if;
end $$;

revoke all on function public.visit(uuid)                         from public;
revoke all on function public.record_answer(text, boolean, uuid)  from public;
grant execute on function public.visit(uuid)                        to anon, authenticated;
grant execute on function public.record_answer(text, boolean, uuid) to anon, authenticated;

-- ---------- Private views for the site owner (Supabase > Table Editor > schema "admin") ----------
create schema if not exists admin;
revoke all on schema admin from public, anon, authenticated;

-- Headline numbers.
create or replace view admin.summary as
select
  (select count(*) from public.visitors)                                                as people_all_time,
  (select count(*) from public.visitors where last_seen > now() - interval '1 day')    as active_last_24h,
  (select count(*) from public.visitors where last_seen > now() - interval '7 days')   as active_last_7_days,
  (select count(*) from public.visitors where days_active > 1)                          as came_back_another_day,
  (select coalesce(sum(answered), 0) from public.daily_stats where course <> 'site')    as answers_all_time,
  (select count(distinct student) from public.study_log)                                as verified_students,
  (select count(*) from public.study_reports where name is not null)                    as verified_with_name;

-- One row per day, newest first.
create or replace view admin.usage_by_day as
select day,
       max(visitors)     filter (where course = 'site') as people,
       max(new_visitors) filter (where course = 'site') as new_people,
       max(sessions)     filter (where course = 'site') as visits,
       max(peak_online)  filter (where course = 'site') as most_online_at_once,
       coalesce(sum(answered) filter (where course = 'ai'), 0)  as ai_answers,
       coalesce(sum(answered) filter (where course = 'psy'), 0) as psych_answers,
       round(100.0 * sum(correct) filter (where course <> 'site')
             / nullif(sum(answered) filter (where course <> 'site'), 0)) as pct_right
  from public.daily_stats
 group by day
 order by day desc;

-- Everyone who used the site (anonymous code, Amsterdam time), most recent first.
create or replace view admin.people as
select left(id::text, 8)                                   as person,
       first_seen at time zone 'Europe/Amsterdam'          as first_seen,
       last_seen  at time zone 'Europe/Amsterdam'          as last_seen,
       days_active, sessions as visits, answers,
       round(100.0 * correct / nullif(answers, 0))          as pct_right
  from public.visitors
 order by last_seen desc;

-- Students who turned on the verified study record, with the name they chose.
create or replace view admin.verified_students as
select coalesce(r.name, '(no name given)')                               as name,
       r.code                                                             as report_code,
       min(l.at) at time zone 'Europe/Amsterdam'                         as first_answer,
       max(l.at) at time zone 'Europe/Amsterdam'                         as last_answer,
       count(*)                                                           as answers,
       round(100.0 * count(*) filter (where l.correct) / count(*))        as pct_right,
       count(distinct (l.at at time zone 'Europe/Amsterdam')::date)       as days_practised,
       (select coalesce(sum(t.seconds), 0) / 60 from public.study_time t where t.student = l.student) as minutes_studied
  from public.study_log l
  left join public.study_reports r on r.student = l.student
 group by l.student, r.name, r.code
 order by max(l.at) desc;

revoke all on all tables in schema admin from public, anon, authenticated;
