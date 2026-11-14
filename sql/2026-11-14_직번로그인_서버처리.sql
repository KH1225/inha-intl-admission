-- 직번 로그인을 서버 함수(staff-login)로 옮깁니다 (2026-11-14)
-- · 로그인하지 않은 사람이 직번으로 교직원 이메일을 알아낼 수 없도록, login_email 함수를 서버 전용으로 바꿉니다.
-- · 같은 직번으로 여러 번 틀리면 잠그기 위한 실패 기록 표(login_failures)를 만듭니다.
--
-- ※ 반드시 서버 함수 staff-login 을 먼저 배포하고, 현황판에서 직번으로 로그인이 되는 것을 확인한 뒤 실행하세요.
--   (이 SQL을 실행하면 예전 방식의 직번 로그인은 더 이상 동작하지 않습니다)
-- Supabase > SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전합니다.

create table if not exists public.login_failures (
  id     bigint generated always as identity primary key,
  emp_no text not null,
  at     timestamptz not null default now()
);
create index if not exists login_failures_emp_at on public.login_failures (emp_no, at);
alter table public.login_failures enable row level security;
revoke all on public.login_failures from anon, authenticated;
grant select, insert, delete on public.login_failures to service_role;

revoke execute on function public.login_email(text) from public, anon, authenticated;
grant execute on function public.login_email(text) to service_role;

-- 확인: 두 줄 모두 '안전' 이면 성공입니다.
select 'login_email 외부 호출' as 확인,
       case when has_function_privilege('anon', 'public.login_email(text)', 'execute') then '열려 있음 (다시 실행하세요)' else '안전' end as 값
union all
select 'login_failures 표', case when to_regclass('public.login_failures') is not null then '안전' else '없음' end;
