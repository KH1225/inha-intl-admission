-- 학과 쪽(학과장·교수) 판정에도 '보류' 허용 (2026-11-25)
-- Supabase > SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전합니다.
--
-- 지금까지는 학과 쪽 평가는 C가 없으면 무조건 '합격'으로 자동 판정되어, 화면에서 '보류'를 골라도 합격으로 바뀌었습니다.
-- 국제교류원장 쪽과 똑같이, C가 없으면 평가자가 '합격' 또는 '보류'를 직접 고를 수 있게 합니다.
-- 아래 함수는 바로 전 버전(2026-11-25_면접위원_배정_국제교류팀_평가허용.sql)과 같고, 판정 부분 한 줄만 바뀌었습니다.
-- 학과 쪽 판정은 참고용이며, 지원자의 최종 면접 결과(통과/탈락/대기)는 지금처럼 국제교류원 쪽 판정으로만 정해집니다.

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
    elsif new.result in ('보류', '불합격') then
      null;                                  -- 평가자가 직접 선택한 보류/불합격은 유지 (2026-11-25: 학과 쪽도 원장과 동일)
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

-- 확인: '학과 보류 허용' 이 true 이면 성공입니다.
select '학과 보류 허용' as 확인,
       (pg_get_functiondef('public.trg_eval_guard()'::regprocedure) like '%elsif new.result in (''보류'', ''불합격'')%')::text as 값;
