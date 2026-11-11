-- 면접 안내 메일 발송 기록 (2026-11-11)
-- Supabase > SQL Editor 에 붙여 넣고 Run. 여러 번 실행해도 안전합니다.

create table if not exists public.mail_logs (
  id          bigint generated always as identity primary key,
  applicant_id text,
  kind        text not null default '면접안내',
  to_email    text,
  subject     text,
  ok          boolean not null default true,
  error       text,
  sent_by     uuid,
  sent_at     timestamptz not null default now()
);
create index if not exists mail_logs_applicant_idx on public.mail_logs (applicant_id, sent_at desc);

alter table public.mail_logs enable row level security;

-- 총괄관리자·국제교류팀만 기록 조회 (기록은 서버 함수만 씁니다)
drop policy if exists mail_logs_staff_select on public.mail_logs;
create policy mail_logs_staff_select on public.mail_logs for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'staff') and p.active));
grant select on public.mail_logs to authenticated;

-- 확인: mail_logs 가 나오면 성공입니다.
select table_name from information_schema.tables where table_schema = 'public' and table_name = 'mail_logs';
