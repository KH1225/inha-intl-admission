-- 직번으로 로그인 (2026-11-11)
-- 계정 관리에서 직원별 '직번'을 등록하면, 로그인 화면에서 이메일 대신 직번을 입력할 수 있습니다.
-- Supabase > SQL Editor 에 붙여 넣고 Run. 여러 번 실행해도 안전합니다.

alter table public.profiles add column if not exists emp_no text;
create unique index if not exists profiles_emp_no_key on public.profiles (emp_no) where emp_no is not null;
grant select (emp_no), insert (emp_no), update (emp_no) on public.profiles to authenticated;

-- 직번 → 로그인 이메일 (사용 중인 계정만). 비밀번호 확인은 기존 로그인 절차가 그대로 합니다.
create or replace function public.login_email(p_emp_no text)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.emp_no = btrim(p_emp_no) and p.active
  limit 1
$$;
revoke all on function public.login_email(text) from public;
grant execute on function public.login_email(text) to anon, authenticated;

-- 확인: emp_no 칸과 login_email 함수가 나오면 성공입니다.
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'emp_no'
union all
select proname from pg_proc where proname = 'login_email';
