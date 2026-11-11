-- 지원자별 기숙사 기간·객실 유형 (2026-11-11)
-- 지원자 정보의 '기숙사' 칸에서 고르며, 오리엔테이션 안내 메일의 기숙사비가 이 값으로 자동 계산됩니다.
--   16-2A 16주 2인실 A(개별 욕실) / 16-2B 16주 2인실 B / 16-3 16주 3인실 / 16-4 16주 4인실
--   24-2A 24주 2인실 A(개별 욕실) / 24-2B 24주 2인실 B / 24-3 24주 3인실 / 24-4 24주 4인실
-- Supabase > SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전합니다.

alter table public.applicants add column if not exists dorm_room text;

alter table public.applicants drop constraint if exists applicants_dorm_room_check;
alter table public.applicants add constraint applicants_dorm_room_check
  check (dorm_room is null or dorm_room in ('16-2A','16-2B','16-3','16-4','24-2A','24-2B','24-3','24-4'));

-- 확인: dorm_room 이 나오면 성공입니다.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'applicants' and column_name = 'dorm_room';
