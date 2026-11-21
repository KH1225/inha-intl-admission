-- 어학능력에 사회통합프로그램(KIIP) 단계 추가 (2026-11-21)
-- Supabase > SQL Editor 에 붙여 넣고 Run. 여러 번 실행해도 안전합니다.
-- 0~5단계 (5단계 = 이수). 비워 두면 '없음'.

alter table public.applicants add column if not exists kiip_level smallint;
alter table public.applicants drop constraint if exists applicants_kiip_level_chk;
alter table public.applicants add constraint applicants_kiip_level_chk check (kiip_level is null or kiip_level between 0 and 5);

-- 확인: '있음' 이면 성공
select '사회통합프로그램 칸' as 확인,
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'applicants' and column_name = 'kiip_level') then '있음' else '없음' end as 값;
