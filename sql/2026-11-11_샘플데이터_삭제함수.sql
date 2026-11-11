-- 테스트용 샘플 지원자 삭제 함수 (2026-11-11)
-- 사이트의 '샘플 데이터' 화면에서 만든 샘플 지원자(접수번호가 SAMPLE- 로 시작)와
-- 그 지원자의 모든 기록(서류 체크, 면접 순서·평가·서명, 납부, 문서 발급 이력, 상태 이력, 메일 기록, 입학지원서 기록 등)을 한 번에 지웁니다.
-- 실제 지원자는 접수번호가 SAMPLE- 로 시작하지 않으므로 지워지지 않습니다.
-- 총괄관리자만 실행할 수 있습니다.
-- Supabase > SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전합니다.

create or replace function public.delete_sample_applicants()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids  text[];
  r      record;
  pass   int;
  left_n int;
  n      int;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.active and p.role = 'admin') then
    raise exception '총괄관리자만 샘플 데이터를 삭제할 수 있습니다.';
  end if;

  select array_agg(id::text) into v_ids from public.applicants where receipt_no like 'SAMPLE-%';
  if v_ids is null then return 0; end if;

  -- applicant_id 칸이 있는 모든 표에서 샘플 기록 삭제 (서로 참조하는 표가 있어 몇 번 반복)
  for pass in 1..4 loop
    left_n := 0;
    for r in
      select c.table_name from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
      where c.table_schema = 'public' and c.column_name = 'applicant_id' and c.table_name <> 'applicants'
    loop
      begin
        execute format('delete from public.%I where applicant_id::text = any($1)', r.table_name) using v_ids;
      exception when foreign_key_violation then
        left_n := left_n + 1;
      end;
    end loop;
    exit when left_n = 0;
  end loop;

  delete from public.applicants where id::text = any(v_ids);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.delete_sample_applicants() from public;
grant execute on function public.delete_sample_applicants() to authenticated;

-- 확인: delete_sample_applicants 가 나오면 성공입니다.
select proname from pg_proc where proname = 'delete_sample_applicants';
