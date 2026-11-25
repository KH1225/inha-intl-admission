-- 학과장(학과 면접위원 포함)이 자기 학과 지원자의 국제교류원장 평가를 볼 수 있게 (2026-11-25)
-- Supabase > SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전합니다.
--
-- '열람' 규칙만 하나 추가합니다. 기존 규칙은 그대로이고, 학과장이 원장 평가를 고치거나 쓸 수는 없습니다.
--   - 학과장: 소속 학과 지원자의 '원장'(국제교류원) 평가 조회
--   - 면접위원 배정에서 학과 면접위원으로 배정된 교수: 배정된 학과 지원자의 '원장' 평가 조회

create or replace function public.dept_can_view_dir_eval(p_applicant text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.profiles p
      join public.applicants a on a.id::text = p_applicant
     where p.id = auth.uid() and p.active and p.role = 'dept'
       and (a.department_id = p.department_id
            or exists (select 1 from public.interview_panels ip
                        where ip.profile_id = p.id and ip.evaluator_type = '학과장'
                          and ip.department_id = a.department_id)))
$$;
revoke all on function public.dept_can_view_dir_eval(text) from public;
grant execute on function public.dept_can_view_dir_eval(text) to authenticated;

drop policy if exists eval_dept_read_dir on public.interview_evaluations;
create policy eval_dept_read_dir on public.interview_evaluations for select to authenticated
  using (evaluator_type = '원장' and public.dept_can_view_dir_eval(applicant_id::text));

-- 확인: eval_dept_read_dir 가 보이면 성공입니다.
select policyname as 규칙, cmd as 동작
  from pg_policies
 where schemaname = 'public' and tablename = 'interview_evaluations' and policyname = 'eval_dept_read_dir';
