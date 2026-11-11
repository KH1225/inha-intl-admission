-- 지원자 '추가 이메일'(보호자·유학원 등, 안내 메일 참조 수신) 칸 추가 (2026-11-11)
-- Supabase > SQL Editor 에 붙여 넣고 Run. 여러 번 실행해도 안전합니다.

alter table public.applicants add column if not exists cc_emails text;
grant select (cc_emails), insert (cc_emails), update (cc_emails) on public.applicants to authenticated;

-- 확인: cc_emails 한 줄이 나오면 성공입니다.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'applicants' and column_name = 'cc_emails';
