-- 이메일·연락처 암호화 전 사전 점검 (2026-11-16) — 읽기 전용, 아무것도 바꾸지 않습니다.
-- 이메일·연락처 원문은 나오지 않습니다 (개수와 구조만 봅니다).
-- Supabase > SQL Editor 에 통째로 붙여 넣고 Run → 결과 칸을 클릭 → 펼치기(⤢) → 전체 복사해서 보내 주세요.

select
  '=== 1. 칸 형식 (text 이어야 함) ===' || E'\n' ||
  coalesce((select string_agg(table_name || '.' || column_name || ' : ' || data_type, E'\n')
     from information_schema.columns
    where table_schema = 'public'
      and ((table_name = 'applicants' and column_name in ('email', 'phone', 'cc_emails'))
        or (table_name = 'mail_logs' and column_name = 'to_email'))), '(없음)') ||

  E'\n\n=== 2. 이 칸에 걸린 규칙·색인 (중복 금지·형식 검사가 있으면 알려 주세요) ===\n' ||
  coalesce((select string_agg(c.conname || ' : ' || pg_get_constraintdef(c.oid), E'\n')
     from pg_constraint c
    where c.conrelid = 'public.applicants'::regclass and pg_get_constraintdef(c.oid) ~* '(email|phone)'), '(규칙 없음)') || E'\n' ||
  coalesce((select string_agg(indexname || ' : ' || indexdef, E'\n') from pg_indexes
    where schemaname = 'public' and tablename = 'applicants' and indexdef ~* '(email|phone)'), '(색인 없음)') ||

  E'\n\n=== 3. 이 칸을 쓰는 DB 함수·뷰 (있으면 함께 고쳐야 함) ===\n' ||
  coalesce((select string_agg(distinct '함수 ' || p.proname, E'\n') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosrc ~* 'applicants' and p.prosrc ~* '\m(email|phone|cc_emails)\M'
      and p.proname not in ('login_email')), '(함수 없음)') || E'\n' ||
  coalesce((select string_agg('뷰 ' || viewname, E'\n') from pg_views
    where schemaname = 'public' and definition ~* '\m(email|phone|cc_emails)\M'), '(뷰 없음)') ||

  E'\n\n=== 4. 현재 저장 상태 ===\n' ||
  '지원자 ' || (select count(*) from public.applicants)::text || '명' || E'\n' ||
  '이메일 평문 ' || (select count(*) from public.applicants where email is not null and email <> '' and email not like 'enc:v1:%')::text ||
  ' / 암호문 ' || (select count(*) from public.applicants where email like 'enc:v1:%')::text || E'\n' ||
  '연락처 평문 ' || (select count(*) from public.applicants where phone is not null and phone <> '' and phone not like 'enc:v1:%')::text ||
  ' / 암호문 ' || (select count(*) from public.applicants where phone like 'enc:v1:%')::text || E'\n' ||
  '메일 기록 받는 주소 평문 ' || (select count(*) from public.mail_logs where to_email is not null and to_email not like 'enc:v1:%')::text
  as 점검결과;
