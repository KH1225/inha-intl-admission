-- 면접 대상자 전용 보기(interview_targets)에 편입 학년·지원경로·협약학교 칸 추가 (2026-11-25)
-- Supabase > SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전합니다.
--
-- 원장·학과장 계정은 지원자를 이 보기에서 불러오는데, 편입 학년·지원경로·협약학교 칸이 없어
-- 면접 화면에 "편입학"만 나오고 학년·협약학교가 보이지 않았습니다.
-- 기존 정의(보여 주는 지원자 범위·WHERE 조건 포함)는 DB에 있는 것을 그대로 읽어 쓰고,
-- 맨 끝에 아래 4개 칸만 덧붙입니다. 권한(GRANT)도 그대로 유지됩니다.
--   transfer_year       편입 학년
--   route               지원경로
--   partner_school_id   협약학교 번호
--   partner_school_name 협약학교 이름

do $$
declare
  def text := pg_get_viewdef('public.interview_targets'::regclass, true);
  new_def text;
begin
  if def ~ '\mpartner_school_name\M' then
    raise notice '이미 협약학교 칸이 있습니다. 바꿀 것이 없습니다.';
    return;
  end if;
  -- 첫 번째 "FROM applicants a" 바로 앞에 칸을 덧붙임 (나머지 정의는 그대로)
  new_def := regexp_replace(def, '\s+FROM\s+applicants\s+a\M',
    E',\n    a.transfer_year,\n    a.route,\n    a.partner_school_id,\n'
    || E'    ( SELECT ps.name FROM public.partner_schools ps WHERE ps.id = a.partner_school_id) AS partner_school_name\n'
    || E'   FROM applicants a');
  if new_def = def then
    raise exception '보기 정의에서 "FROM applicants a" 를 찾지 못했습니다. 바꾸지 않았습니다.';
  end if;
  execute 'create or replace view public.interview_targets as ' || new_def;
end $$;

-- 확인: 아래 4개 칸이 나오면 성공입니다.
select column_name as 추가된_칸, data_type as 형식
  from information_schema.columns
 where table_schema = 'public' and table_name = 'interview_targets'
   and column_name in ('transfer_year', 'route', 'partner_school_id', 'partner_school_name')
 order by ordinal_position;
