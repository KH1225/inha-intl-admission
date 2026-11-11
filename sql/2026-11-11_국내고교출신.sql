-- 지원자에 '국내 고교 출신' 표시 칸 추가 (2026-11-11)
-- 신입학 국내 고교 출신자는 '외국학교 학력조회 동의서'가 면제됩니다.
-- Supabase > SQL Editor 에 붙여 넣고 Run. 여러 번 실행해도 안전합니다.

alter table public.applicants add column if not exists domestic_hs boolean not null default false;
grant select (domestic_hs), insert (domestic_hs), update (domestic_hs) on public.applicants to authenticated;

-- 확인: domestic_hs 한 줄이 나오면 성공입니다.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'applicants' and column_name = 'domestic_hs';
