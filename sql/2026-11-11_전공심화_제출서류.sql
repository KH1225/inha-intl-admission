-- 제출서류 구분에 '전공심화' 추가 (2026-11-11)
-- (먼저 sql/2026-11-11_제출서류_설정.sql 을 실행한 뒤 실행하세요)
-- document_types.admission_kind 에 '전공심화' 값을 넣을 수 있게 합니다.
-- enum 형식이든, 글자 + CHECK 제약 형식이든 알아서 처리합니다. 여러 번 실행해도 안전합니다.

do $$
declare
  col_type text;
  col_udt  text;
  r record;
begin
  select data_type, udt_name into col_type, col_udt
  from information_schema.columns
  where table_schema = 'public' and table_name = 'document_types' and column_name = 'admission_kind';

  if col_type is null then
    raise exception 'document_types.admission_kind 칸을 찾지 못했습니다.';
  end if;

  if col_type = 'USER-DEFINED' then
    execute format('alter type public.%I add value if not exists %L', col_udt, '전공심화');
    raise notice 'enum % 에 전공심화를 추가했습니다.', col_udt;
  else
    for r in
      select conname from pg_constraint
      where conrelid = 'public.document_types'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%admission_kind%'
    loop
      execute format('alter table public.document_types drop constraint %I', r.conname);
      raise notice '기존 제약 % 를 지웠습니다.', r.conname;
    end loop;
    alter table public.document_types add constraint document_types_admission_kind_check
      check (admission_kind in ('신입학', '편입학', '전공심화'));
    raise notice 'CHECK 제약을 새로 만들었습니다.';
  end if;
end $$;

-- 확인: 결과에 전공심화가 보이면 성공입니다. (enum 형식이면 결과가 비어 있어도 성공)
select pg_get_constraintdef(oid) as admission_kind_rule
from pg_constraint
where conrelid = 'public.document_types'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) ilike '%admission_kind%';
