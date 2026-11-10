-- 접수취소 상태 추가 (2026-11-10)
-- Supabase > SQL Editor 에 통째로 붙여 넣고 Run 을 한 번 누르세요.
-- status 칸이 enum 형식이든, 글자 + CHECK 제약 형식이든 알아서 처리합니다.
-- 여러 번 실행해도 안전합니다.

do $$
declare
  col_type text;
  col_udt  text;
  r record;
begin
  select data_type, udt_name into col_type, col_udt
  from information_schema.columns
  where table_schema = 'public' and table_name = 'applicants' and column_name = 'status';

  if col_type is null then
    raise exception 'applicants.status 칸을 찾지 못했습니다.';
  end if;

  if col_type = 'USER-DEFINED' then
    -- enum 형식인 경우: 값만 하나 추가
    execute format('alter type public.%I add value if not exists %L', col_udt, '접수취소');
    raise notice 'enum % 에 접수취소를 추가했습니다.', col_udt;
  else
    -- 글자 형식인 경우: status 를 검사하는 CHECK 제약을 새 목록으로 교체
    for r in
      select conname from pg_constraint
      where conrelid = 'public.applicants'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%status%'
    loop
      execute format('alter table public.applicants drop constraint %I', r.conname);
      raise notice '기존 제약 % 를 지웠습니다.', r.conname;
    end loop;
    alter table public.applicants add constraint applicants_status_check
      check (status in ('서류심사', '보완요청', '면접심사', '최종합격', '불합격', '등록완료', '접수취소'));
    raise notice 'CHECK 제약을 새로 만들었습니다.';
  end if;
end $$;

-- 확인: 아래 결과에 접수취소가 보이면 성공입니다.
select pg_get_constraintdef(oid) as status_rule
from pg_constraint
where conrelid = 'public.applicants'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) ilike '%status%';
