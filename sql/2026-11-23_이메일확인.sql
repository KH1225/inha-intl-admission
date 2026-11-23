-- 개별지원·국내 고교 졸업 지원자 '이메일 확인' 기록 칸 추가 (2026-11-23)
-- Supabase > SQL Editor 에 붙여 넣고 Run. 여러 번 실행해도 안전합니다.
-- 비어 있으면 '미확인', 날짜·시각이 있으면 그때 확인한 것입니다.

alter table public.applicants add column if not exists email_verified_at timestamptz;

-- 확인: '있음' 이면 성공
select '이메일 확인 칸' as 확인,
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'applicants' and column_name = 'email_verified_at') then '있음' else '없음' end as 값;
