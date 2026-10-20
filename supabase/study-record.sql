-- BSc AI Practice: opt-in verified study records.
-- Run AFTER setup.sql: Supabase > SQL Editor > New query > paste > Run. Safe to run more than once.
--
-- A student who turns recording on gets a random study id that stays secret in their browser.
-- Every answer and their active study time are stored with the SERVER's clock, so they can't be edited or backdated.
-- A report is only visible through a separate share code the student chooses to create. No email, no IP address.

create table if not exists public.study_log (
  id       bigint generated always as identity primary key,
  student  uuid        not null,
  course   text        not null check (course in ('ai', 'psy')),
  topic    text        not null check (char_length(topic) <= 60),
  question text        not null check (char_length(question) <= 40),
  correct  boolean     not null,
  at       timestamptz not null default now()
);
create index if not exists study_log_student_at on public.study_log (student, at);

create table if not exists public.study_time (
  student   uuid        not null,
  day       date        not null,
  seconds   integer     not null default 0,
  last_beat timestamptz,
  primary key (student, day)
);

create table if not exists public.study_reports (
  code       text        primary key,
  student    uuid        not null unique,
  name       text        check (char_length(name) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- No policies: visitors can't read or write these tables directly, only through the functions below.
alter table public.study_log     enable row level security;
alter table public.study_time    enable row level security;
alter table public.study_reports enable row level security;

-- Save one answer. The server sets the time; at most one answer per second per student.
create or replace function public.log_answer(p_student uuid, p_course text, p_topic text, p_question text, p_correct boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_course not in ('ai', 'psy') then return; end if;
  if exists (select 1 from study_log where student = p_student and at > now() - interval '1 second') then return; end if;
  insert into study_log (student, course, topic, question, correct)
  values (p_student, p_course, left(p_topic, 60), left(p_question, 40), p_correct);
end $$;

-- Called about every 45 s while a student is actively on a quiz page. Adds the real time elapsed since the
-- previous call (only if it was under 100 s ago, so idle gaps never count).
create or replace function public.study_beat(p_student uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_day  date := today_ams();
  v_prev timestamptz;
begin
  select last_beat into v_prev from study_time where student = p_student and day = v_day;
  if not found then
    insert into study_time (student, day, seconds, last_beat) values (p_student, v_day, 0, now());
  else
    update study_time
       set seconds = seconds + case when v_prev is not null and now() - v_prev < interval '100 seconds'
                                    then least(extract(epoch from now() - v_prev)::int, 100) else 0 end,
           last_beat = now()
     where student = p_student and day = v_day;
  end if;
end $$;

-- The full record for one student (internal: not callable by visitors).
create or replace function public.report_json(p_student uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'generated', now(),
    'first',    (select min(at) from study_log where student = p_student),
    'last',     (select max(at) from study_log where student = p_student),
    'answers',  (select count(*) from study_log where student = p_student),
    'correct',  (select count(*) filter (where correct) from study_log where student = p_student),
    'seconds',  (select coalesce(sum(seconds), 0) from study_time where student = p_student),
    'courses',  (select coalesce(json_agg(c order by c.course), '[]'::json) from (
                   select course, count(*) as answers, count(*) filter (where correct) as correct,
                          count(distinct question) as questions
                     from study_log where student = p_student group by course) c),
    'topics',   (select coalesce(json_agg(t order by t.course, t.topic), '[]'::json) from (
                   select course, topic, count(*) as answers, count(*) filter (where correct) as correct
                     from study_log where student = p_student group by course, topic) t),
    'days',     (select coalesce(json_agg(d order by d.day), '[]'::json) from (
                   select coalesce(l.day, s.day) as day, coalesce(l.answers, 0) as answers,
                          coalesce(l.correct, 0) as correct, coalesce(s.seconds, 0) as seconds
                     from (select (at at time zone 'Europe/Amsterdam')::date as day, count(*) as answers,
                                  count(*) filter (where correct) as correct
                             from study_log where student = p_student group by 1) l
                     full join (select day, seconds from study_time where student = p_student and seconds > 0) s
                       on s.day = l.day) d)
  )
$$;

-- The student's own view (needs their secret study id).
create or replace function public.my_record(p_student uuid)
returns json language sql stable security definer set search_path = public as $$
  select (report_json(p_student)::jsonb
          || jsonb_build_object('code', r.code, 'name', r.name))::json
    from (select 1) one
    left join study_reports r on r.student = p_student
$$;

-- Create (or update the name on) the student's share code, e.g. 'K7Q2-9XMB'.
create or replace function public.publish_report(p_student uuid, p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  select code into v_code from study_reports where student = p_student;
  if v_code is null then
    loop
      v_code := upper(substr(md5(gen_random_uuid()::text), 1, 4) || '-' || substr(md5(gen_random_uuid()::text), 1, 4));
      exit when not exists (select 1 from study_reports where code = v_code);
    end loop;
    insert into study_reports (code, student, name) values (v_code, p_student, nullif(trim(left(p_name, 60)), ''));
  else
    update study_reports set name = nullif(trim(left(p_name, 60)), ''), updated_at = now() where student = p_student;
  end if;
  return v_code;
end $$;

-- Public report for anyone holding the share code. Never reveals the study id.
create or replace function public.get_report(p_code text)
returns json language sql stable security definer set search_path = public as $$
  select (report_json(r.student)::jsonb
          || jsonb_build_object('code', r.code, 'name', r.name, 'published', r.created_at))::json
    from study_reports r
   where r.code = upper(trim(p_code))
$$;

-- Delete everything stored for this student.
create or replace function public.delete_my_record(p_student uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from study_log     where student = p_student;
  delete from study_time    where student = p_student;
  delete from study_reports where student = p_student;
end $$;

revoke all on function public.report_json(uuid) from public, anon, authenticated;
revoke all on function public.log_answer(uuid, text, text, text, boolean) from public;
revoke all on function public.study_beat(uuid)                         from public;
revoke all on function public.my_record(uuid)                          from public;
revoke all on function public.publish_report(uuid, text)               from public;
revoke all on function public.get_report(text)                         from public;
revoke all on function public.delete_my_record(uuid)                   from public;
grant execute on function public.log_answer(uuid, text, text, text, boolean) to anon, authenticated;
grant execute on function public.study_beat(uuid)                         to anon, authenticated;
grant execute on function public.my_record(uuid)                          to anon, authenticated;
grant execute on function public.publish_report(uuid, text)               to anon, authenticated;
grant execute on function public.get_report(text)                         to anon, authenticated;
grant execute on function public.delete_my_record(uuid)                   to anon, authenticated;
