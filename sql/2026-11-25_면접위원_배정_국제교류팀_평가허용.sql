-- 면접위원 배정 후속: 국제교류팀 면접위원의 평가 저장 허용 (2026-11-25)
-- 반드시 2026-11-25_면접위원_배정.sql 을 먼저 적용한 뒤 실행하세요.
-- Supabase > SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전합니다.
--
-- 기존 평가 검사(trg_eval_guard)는 총괄관리자·학과장·국제교류원장만 평가를 입력할 수 있게 되어 있어
-- 배정된 국제교류팀 직원의 평가가 막힙니다. 아래는 기존 함수와 똑같고, '국제교류팀(staff)' 부분만 추가했습니다.
--   - 국제교류팀: 면접위원 배정에서 자기에게 배정된 지원자의 '원장'(국제교류원) 평가만
--   - 면접심사 단계의 지원자만, 제출 후에는 수정 불가 (수정이 필요하면 총괄관리자가 제출 취소)

CREATE OR REPLACE FUNCTION public.trg_eval_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r          text := coalesce(public.current_role_name(), '');
  st         public.app_status;
  v_complete boolean;
  v_has_c    boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  if r not in ('admin', 'dept', 'director', 'staff') then
    raise exception '면접 평가 입력 권한이 없습니다';
  end if;

  if r = 'director' then
    if new.evaluator_type <> '원장' then
      raise exception '국제교류원장은 원장 평가만 입력할 수 있습니다';
    end if;
    select a.status into st from public.applicants a where a.id = new.applicant_id;
    if st is distinct from '면접심사' then
      raise exception '면접심사 단계의 지원자만 평가를 입력할 수 있습니다';
    end if;
  end if;

  if r = 'dept' then
    if new.evaluator_type <> '학과장' then
      raise exception '학과장은 학과장 평가만 입력할 수 있습니다';
    end if;
    select a.status into st from public.applicants a where a.id = new.applicant_id;
    if st is distinct from '면접심사' then
      raise exception '면접심사 단계의 지원자만 평가를 입력할 수 있습니다';
    end if;
    if tg_op = 'UPDATE' then
      if old.submitted then
        raise exception '이미 제출된 평가표입니다. 수정이 필요하면 국제교류팀에 문의하세요';
      end if;
    end if;
  end if;

  -- (2026-11-25 추가) 국제교류팀: 면접위원으로 배정된 지원자의 국제교류원 평가만
  if r = 'staff' then
    if new.evaluator_type <> '원장'
       or not public.is_assigned_evaluator(new.applicant_id::text, '원장') then
      raise exception '면접위원으로 배정된 지원자의 국제교류원 평가만 입력할 수 있습니다';
    end if;
    select a.status into st from public.applicants a where a.id = new.applicant_id;
    if st is distinct from '면접심사' then
      raise exception '면접심사 단계의 지원자만 평가를 입력할 수 있습니다';
    end if;
    if tg_op = 'UPDATE' then
      if old.submitted then
        raise exception '이미 제출된 평가표입니다. 수정이 필요하면 총괄관리자에게 문의하세요';
      end if;
    end if;
  end if;

  -- 자동 판정: C가 하나라도 있으면 불합격, 없으면 합격
  v_complete := new.item1 is not null and new.item2 is not null and new.item3 is not null;

  if v_complete then
    v_has_c := new.item1 = 'C' or new.item2 = 'C' or new.item3 = 'C';
    if v_has_c then
      new.result := '불합격';
    elsif new.evaluator_type = '원장' and new.result in ('보류', '불합격') then
      null;                                  -- 원장이 직접 선택한 보류/불합격은 유지
    else
      new.result := '합격';
    end if;
  else
    new.result := null;                      -- 3개 항목을 다 입력하기 전에는 판정 없음
  end if;

  -- 제출 조건
  if new.submitted then
    if not v_complete then
      raise exception '3개 항목을 모두 평가해야 저장·제출할 수 있습니다';
    end if;
    if new.evaluator_type = '원장' and coalesce(btrim(new.comment), '') = '' then
      null; -- 종합심사의견 선택 입력으로 변경 (2026-11-11)
    end if;
    if tg_op = 'INSERT' then
      new.submitted_at := now();
    elsif not old.submitted then
      new.submitted_at := now();
    else
      new.submitted_at := old.submitted_at;
    end if;
  else
    new.submitted_at := null;
  end if;

  -- 평가자 기록: 총괄관리자가 수정(오류 정정·제출 취소)해도 평가자는 원래 평가자로 유지
  if r = 'admin' and tg_op = 'UPDATE' then
    new.evaluated_by := old.evaluated_by;
  else
    new.evaluated_by := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end $function$;

-- 총괄관리자가 평가를 고치거나 제출 취소해도 평가자 이름은 원래 평가자로 유지
-- (화면이 저장할 때 평가자 이름을 함께 보내므로, 관리자 수정 시에는 원래 값으로 되돌립니다)
CREATE OR REPLACE FUNCTION public.trg_eval_keep_evaluator()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'UPDATE' and coalesce(public.current_role_name(), '') = 'admin' then
    new.evaluator_id   := old.evaluator_id;
    new.evaluator_name := old.evaluator_name;
  end if;
  return new;
end $function$;
drop trigger if exists eval_keep_evaluator on public.interview_evaluations;
create trigger eval_keep_evaluator before update on public.interview_evaluations
  for each row execute function public.trg_eval_keep_evaluator();

-- 확인: 'staff 허용' 이 true 이면 성공입니다.
select 'staff 허용' as 확인,
       (pg_get_functiondef('public.trg_eval_guard()'::regprocedure) like '%''staff''%')::text as 값
union all
select '평가자 유지 트리거', count(*)::text from pg_trigger
 where tgrelid = 'public.interview_evaluations'::regclass and tgname = 'eval_keep_evaluator';
