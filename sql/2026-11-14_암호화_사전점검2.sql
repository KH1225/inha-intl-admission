-- 암호화 사전 점검 2 (읽기 전용 — 아무것도 바꾸지 않고, 여권번호 원문도 나오지 않습니다)
-- Run 후 결과 칸 하나를 클릭 → 오른쪽의 펼치기(⤢) 아이콘 → 내용 전체 복사 → 채팅에 붙여 넣어 주세요.

select
  '=== 칸 ===' || E'\n' ||
  (select string_agg(column_name || ' : ' || data_type, E'\n' order by ordinal_position)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'applicants'
      and (column_name ilike '%passport%' or column_name ilike '%alien%' or column_name ilike '%enc%' or column_name ilike '%hmac%')) ||
  E'\n\n=== 원문이 남아 있는 행 수 ===\n' ||
  'passport_no 원문 있음: ' || (select count(*) from public.applicants where passport_no is not null and passport_no <> '')::text || E'\n' ||
  'passport_no_enc 있음: ' || (select count(*) from public.applicants where passport_no_enc is not null)::text ||
  E'\n\n=== 원문 보기 함수 ===\n' ||
  coalesce((select string_agg(pg_get_functiondef(p.oid), E'\n-----\n') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'get_applicant_secrets'), '(없음)') ||
  E'\n\n=== 트리거 함수 ===\n' ||
  coalesce((select string_agg(pg_get_functiondef(p.oid), E'\n-----\n') from pg_trigger t join pg_proc p on p.oid = t.tgfoid
             where t.tgrelid = 'public.applicants'::regclass and not t.tgisinternal), '(없음)') ||
  E'\n\n=== 암호화 관련 함수 이름 ===\n' ||
  coalesce((select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname in ('public', 'private') and (p.prosrc ilike '%pgp_sym%' or p.prosrc ilike '%encrypt%' or p.prosrc ilike '%hmac%' or p.prosrc ilike '%vault%')), '(없음)') ||
  E'\n\n=== 열람 기록 표 칸 ===\n' ||
  coalesce((select string_agg(column_name || ' : ' || data_type, E'\n' order by ordinal_position)
             from information_schema.columns where table_schema = 'public' and table_name = 'pii_access_log'), '(없음)') ||
  E'\n\n=== vault 사용 ===\n' ||
  coalesce((select 'vault 비밀 ' || count(*)::text || '개: ' || string_agg(name, ', ') from vault.secrets), '(없음)')
  as 점검결과;
