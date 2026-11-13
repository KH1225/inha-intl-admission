-- 여권번호·외국인등록번호 암호화 전 사전 점검 (읽기 전용 — 아무것도 바꾸지 않습니다)
-- Supabase > SQL Editor 에 통째로 붙여 넣고 Run → 결과 표 전체를 캡처해서 보내 주세요.
-- 여권번호 원문은 나오지 않습니다 (개수만 셉니다).

select '1. 지원자 표 칸' as 항목,
       string_agg(column_name || ':' || data_type, ', ' order by ordinal_position) as 내용
from information_schema.columns
where table_schema = 'public' and table_name = 'applicants'
  and (column_name ilike '%passport%' or column_name ilike '%alien%' or column_name ilike '%enc%')
union all
select '2. 지원자 표 트리거',
       coalesce(string_agg(tgname || ' → ' || p.proname, ', '), '(없음)')
from pg_trigger t join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.applicants'::regclass and not t.tgisinternal
union all
select '3. 원문 보기 함수', coalesce(string_agg(pg_get_functiondef(p.oid), E'\n-----\n'), '(없음)')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'get_applicant_secrets'
union all
select '4. 트리거 함수 내용', coalesce(string_agg(pg_get_functiondef(p.oid), E'\n-----\n'), '(없음)')
from pg_trigger t join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.applicants'::regclass and not t.tgisinternal
union all
select '5. 열람 기록 표', coalesce(string_agg(table_name, ', '), '(없음)')
from information_schema.tables
where table_schema = 'public' and (table_name ilike '%log%' or table_name ilike '%access%' or table_name ilike '%secret%')
union all
select '6. 다른 표의 여권 칸', coalesce(string_agg(table_name || '.' || column_name, ', '), '(없음)')
from information_schema.columns
where table_schema = 'public' and table_name <> 'applicants' and (column_name ilike '%passport%' or column_name ilike '%alien%')
union all
select '7. pgcrypto 설치', coalesce((select extversion from pg_extension where extname = 'pgcrypto'), '(없음)')
union all
select '8. 저장된 개수', (select count(*) from public.applicants)::text || '명 중 여권번호 있는 행 ' ||
       (select count(*) from public.applicants where passport_last4 is not null)::text;
