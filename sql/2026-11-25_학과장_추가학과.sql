-- 학과장 계정 하나로 여러 학과 담당 (예: AI소프트웨어학과 + AI소프트웨어학과(심화)) (2026-11-25)
-- Supabase > SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전합니다.
--
-- 계정에 '추가 학과' 칸(extra_department_ids)을 만들고, 학과장 권한을 확인하는 곳을 모두
-- "기본 학과 또는 추가 학과" 로 넓힙니다. 추가 학과를 비워 두면 지금과 완전히 같습니다.
-- 함수 이름·인자·반환형은 그대로라서 이 함수들을 쓰는 기존 권한 규칙(policy)은 고칠 필요가 없습니다.
--   바뀌는 곳: dept_can_see(면접 대상·평가·사진 규칙), interview_targets(면접 대상자 보기),
--             can_view_applicant_photo, can_view_credit, can_write_credit, dept_can_view_dir_eval,
--             can_view_applicant_file(있을 때만)

-- 1) 계정에 추가 학과 칸
alter table public.profiles add column if not exists extra_department_ids smallint[] not null default '{}';
grant select (extra_department_ids), update (extra_department_ids) on public.profiles to authenticated;

-- 2) 내가 이 학과를 맡고 있는지 (학과장: 기본 학과 또는 추가 학과)
create or replace function public.dept_has(p_dept integer)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.active and p.role = 'dept'
       and (p.department_id = p_dept or p_dept = any (p.extra_department_ids)))
$$;
revoke all on function public.dept_has(integer) from public;
grant execute on function public.dept_has(integer) to authenticated;

-- 3) 면접 대상·평가·사진 규칙이 쓰는 함수 (기존: a.department_id = current_dept())
CREATE OR REPLACE FUNCTION public.dept_can_see(p_applicant uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.applicants a
    where a.id = p_applicant
      and public.current_role_name() = 'dept'
      and public.dept_has(a.department_id)
      and exists (select 1 from public.interviews i where i.applicant_id = a.id)
  )
$function$;

-- 4) 면접 대상자 보기 (칸 구성은 그대로, 학과 조건만 변경)
CREATE OR REPLACE VIEW public.interview_targets AS
 SELECT a.id,
    a.term_id,
    a.receipt_no,
    a.name_ko,
    a.name_en,
    a.gender,
    a.birth_date,
    a.nationality,
    a.admission_kind,
    a.department_id,
    a.topik_level,
    a.high_school,
    a.gpa,
    a.status,
    a.photo_path,
    i.order_no,
    i.scheduled_at,
    a.transfer_year,
    a.route,
    a.partner_school_id,
    ( SELECT ps.name
           FROM public.partner_schools ps
          WHERE ps.id = a.partner_school_id) AS partner_school_name
   FROM public.applicants a
     LEFT JOIN public.interviews i ON i.applicant_id = a.id
  WHERE public.current_role_name() = 'dept'::text AND public.dept_has(a.department_id)
     OR public.current_role_name() = 'director'::text;

-- 5) 사진·학점인정·원장 평가 열람 함수 (기존: a.department_id = p.department_id)
CREATE OR REPLACE FUNCTION public.can_view_applicant_photo(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and (
      p.role in ('admin', 'staff', 'viewer', 'director')
      or (p.role = 'dept' and exists (
        select 1 from public.applicants a
        where a.id::text = split_part(p_name, '.', 1)
          and (a.department_id = p.department_id or a.department_id = any (p.extra_department_ids))))
    ))
$function$;

CREATE OR REPLACE FUNCTION public.can_view_credit(p_applicant text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and (
      p.role in ('admin', 'staff', 'director')
      or (p.role = 'dept' and exists (
        select 1 from public.applicants a where a.id::text = p_applicant
          and (a.department_id = p.department_id or a.department_id = any (p.extra_department_ids))))))
$function$;

CREATE OR REPLACE FUNCTION public.can_write_credit(p_applicant text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and (
      p.role in ('admin', 'staff')
      or (p.role = 'dept'
          and exists (select 1 from public.applicants a where a.id::text = p_applicant
                        and (a.department_id = p.department_id or a.department_id = any (p.extra_department_ids)))
          and not exists (select 1 from public.credit_reviews r where r.applicant_id = p_applicant and r.submitted))))
$function$;

CREATE OR REPLACE FUNCTION public.dept_can_view_dir_eval(p_applicant text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
      from public.profiles p
      join public.applicants a on a.id::text = p_applicant
     where p.id = auth.uid() and p.active and p.role = 'dept'
       and (a.department_id = p.department_id
            or a.department_id = any (p.extra_department_ids)
            or exists (select 1 from public.interview_panels ip
                        where ip.profile_id = p.id and ip.evaluator_type = '학과장'
                          and ip.department_id = a.department_id)))
$function$;

-- 6) 입학지원서 PDF 열람 함수 (DB에 있을 때만 바꿈)
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'can_view_applicant_file') then
    execute $f$
      create or replace function public.can_view_applicant_file(p_applicant text)
      returns boolean language sql stable security definer set search_path = public as $b$
        select exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.active and (
            p.role in ('admin', 'staff', 'director')
            or (p.role = 'dept' and exists (
              select 1 from public.applicants a where a.id::text = p_applicant
                and (a.department_id = p.department_id or a.department_id = any (p.extra_department_ids))))
          ))
      $b$ $f$;
  end if;
end $$;

-- 확인: 아래 항목이 모두 '적용됨' 이면 성공입니다.
select '추가 학과 칸' as 확인, case when exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'profiles' and column_name = 'extra_department_ids') then '적용됨' else '없음' end as 결과
union all
select '면접 대상 규칙(dept_can_see)', case when pg_get_functiondef('public.dept_can_see(uuid)'::regprocedure) like '%dept_has%' then '적용됨' else '없음' end
union all
select '면접 대상자 보기', case when pg_get_viewdef('public.interview_targets'::regclass) like '%dept_has%' then '적용됨' else '없음' end
union all
select '학점인정 열람·입력', case when pg_get_functiondef('public.can_write_credit(text)'::regprocedure) like '%extra_department_ids%' then '적용됨' else '없음' end;
