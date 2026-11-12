-- 지원경로에 '국내 고교 졸업' 추가 (2026-11-12)
-- applicants.route 가 enum 이든, 글자 + CHECK 제약이든 알아서 처리합니다. 제약이 없으면 아무것도 바꾸지 않습니다.
-- Supabase > SQL Editor 에 붙여 넣고 Run. 여러 번 실행해도 안전합니다.

do $$
declare
  col_type text; col_udt text; r record; n int := 0;
begin
  select data_type, udt_name into col_type, col_udt from information_schema.columns
  where table_schema = 'public' and table_name = 'applicants' and column_name = 'route';
  if col_type is null then raise exception 'applicants.route 칸을 찾지 못했습니다.'; end if;

  if col_type = 'USER-DEFINED' then
    execute format('alter type public.%I add value if not exists %L', col_udt, '협약학교 추천');
    execute format('alter type public.%I add value if not exists %L', col_udt, '우리대학 졸업');
    execute format('alter type public.%I add value if not exists %L', col_udt, '국내 고교 졸업');
    raise notice 'enum % 에 값을 추가했습니다.', col_udt;
  else
    for r in select conname from pg_constraint
             where conrelid = 'public.applicants'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%route%'
    loop
      execute format('alter table public.applicants drop constraint %I', r.conname); n := n + 1;
    end loop;
    if n > 0 then
      alter table public.applicants add constraint applicants_route_check
        check (route is null or route in ('개별지원', '유학원', '협약학교 추천', '우리대학 졸업', '국내 고교 졸업'));
      raise notice 'CHECK 제약을 새로 만들었습니다.';
    else
      raise notice '지원경로 제약이 없어 바꿀 것이 없습니다.';
    end if;
  end if;
end $$;

-- 확인 (CHECK 제약 형식이면 '국내 고교 졸업'이 들어간 목록이 보입니다. 비어 있어도 위에서 오류가 없었으면 성공)
select pg_get_constraintdef(oid) as route_rule from pg_constraint
where conrelid = 'public.applicants'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%route%';
