-- 면접위원 배정: 면접 순서로 나눠서 여러 명이 평가 (2026-11-25)
-- Supabase > SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전합니다.
--
-- 지원자 한 명의 면접 평가는 지금처럼 2건입니다.
--   - 학과 쪽 (평가 구분 '학과장'): 학과장 또는 추가 교수
--   - 국제교류원 쪽 (평가 구분 '원장'): 국제교류원장 또는 국제교류팀 직원
-- 총괄관리자가 [면접 평가 > 면접위원 배정]에서 학과마다 "누가 몇 번~몇 번"을 정합니다.
-- 배정이 없는 학과는 예전과 똑같이 학과장·국제교류원장이 전원을 평가합니다.
-- 추가 교수 계정은 [계정 관리]에서 권한 '학과장', 해당 학과로 만듭니다.

-- 1) 배정표
create table if not exists public.interview_panels (
  id             bigint generated always as identity primary key,
  term_id        text   not null,
  department_id  bigint not null,
  evaluator_type text   not null check (evaluator_type in ('학과장', '원장')),
  profile_id     uuid   not null,
  evaluator_name text,
  order_from     int    not null check (order_from >= 1),
  order_to       int    not null,
  created_at     timestamptz not null default now(),
  check (order_from <= order_to)
);
create index if not exists interview_panels_term on public.interview_panels (term_id);
alter table public.interview_panels enable row level security;

grant select, insert, update, delete on public.interview_panels to authenticated;
drop policy if exists interview_panels_select on public.interview_panels;
drop policy if exists interview_panels_write  on public.interview_panels;
-- 로그인한 사용 권한자는 모두 조회 (내 담당 범위를 알아야 하므로)
create policy interview_panels_select on public.interview_panels for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.active));
-- 배정·수정·삭제는 총괄관리자만
create policy interview_panels_write on public.interview_panels for all to authenticated
  using      (exists (select 1 from public.profiles p where p.id = auth.uid() and p.active and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.active and p.role = 'admin'));

-- 2) 평가 기록에 실제 평가자 남기기
alter table public.interview_evaluations add column if not exists evaluator_id   uuid;
alter table public.interview_evaluations add column if not exists evaluator_name text;
grant select, insert (evaluator_id, evaluator_name), update (evaluator_id, evaluator_name)
  on public.interview_evaluations to authenticated;

-- 3) 배정된 면접위원인지 확인 (지원자 학과·학기·면접 순서가 내 담당 범위 안인지)
create or replace function public.is_assigned_evaluator(p_applicant text, p_type text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.interview_panels ip
      join public.profiles   p on p.id = auth.uid() and p.active
      join public.applicants a on a.id::text = p_applicant
                              and a.department_id = ip.department_id
                              and a.term_id::text = ip.term_id
      join public.interviews i on i.applicant_id::text = p_applicant
     where ip.profile_id = auth.uid()
       and ip.evaluator_type = p_type
       and i.order_no between ip.order_from and ip.order_to)
$$;
revoke all on function public.is_assigned_evaluator(text, text) from public;
grant execute on function public.is_assigned_evaluator(text, text) to authenticated;

-- 4) 배정된 면접위원이 자기 담당 지원자를 평가할 수 있게 (기존 규칙은 그대로 두고 추가만 합니다)
--    학과 쪽은 제출 후 수정 불가, 국제교류원 쪽은 면접심사 단계에서 수정 가능 (기존과 같음)
drop policy if exists ie_panel_select on public.interview_evaluations;
drop policy if exists ie_panel_insert on public.interview_evaluations;
drop policy if exists ie_panel_update on public.interview_evaluations;
create policy ie_panel_select on public.interview_evaluations for select to authenticated
  using (public.is_assigned_evaluator(applicant_id::text, evaluator_type));
create policy ie_panel_insert on public.interview_evaluations for insert to authenticated
  with check (public.is_assigned_evaluator(applicant_id::text, evaluator_type));
create policy ie_panel_update on public.interview_evaluations for update to authenticated
  using      (public.is_assigned_evaluator(applicant_id::text, evaluator_type) and (evaluator_type = '원장' or not coalesce(submitted, false)))
  with check (public.is_assigned_evaluator(applicant_id::text, evaluator_type));

-- 5) 확인: 아래 목록이 나오면 성공입니다.
--    (interview_evaluations 의 규칙·트리거 목록도 함께 보여 줍니다. 국제교류팀 평가가 저장되지 않으면 이 결과를 캡처해서 보내 주세요.)
select '배정표' as 구분, table_name as 이름, '' as 내용 from information_schema.tables
 where table_schema = 'public' and table_name = 'interview_panels'
union all
select '평가자 칸', column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'interview_evaluations' and column_name in ('evaluator_id', 'evaluator_name')
union all
select '평가 규칙', policyname, cmd from pg_policies
 where schemaname = 'public' and tablename = 'interview_evaluations'
union all
select '평가 트리거', tgname, '' from pg_trigger
 where tgrelid = 'public.interview_evaluations'::regclass and not tgisinternal;
