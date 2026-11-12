-- 지원자 '출신 대학' 칸 추가 (대학 진학 이력이 있는 경우) (2026-11-12)
-- Supabase > SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전합니다.

alter table public.applicants add column if not exists prev_university text;  -- 출신 대학 (대학명·학과)

-- 확인: prev_university 가 나오면 성공입니다.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'applicants' and column_name = 'prev_university';
