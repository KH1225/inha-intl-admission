-- 학점 인정 심사: 전적교 학과명 칸 추가 (2026-11-12)
-- Supabase > SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전합니다.
-- (먼저 sql/2026-11-11_학점인정심사.sql 이 실행되어 있어야 합니다)

alter table public.credit_reviews add column if not exists prev_major text;  -- 전적교 학과명

-- 확인: prev_major 가 나오면 성공입니다.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'credit_reviews' and column_name = 'prev_major';
