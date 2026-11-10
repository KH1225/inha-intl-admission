-- 면접평가표 학과장 서명 저장 칸 추가 (2026-11-11)
-- Supabase > SQL Editor 에 통째로 붙여 넣고 Run 을 한 번 누르세요. 여러 번 실행해도 안전합니다.

alter table public.interview_evaluations
  add column if not exists signature text;

-- 서명 이미지 크기 제한 (약 200KB)
alter table public.interview_evaluations drop constraint if exists interview_evaluations_signature_size;
alter table public.interview_evaluations
  add constraint interview_evaluations_signature_size check (signature is null or length(signature) < 200000);

-- 로그인한 사용자가 이 칸을 쓸 수 있도록 허용 (행 단위 권한은 기존 규칙 그대로)
grant select, insert (signature), update (signature) on public.interview_evaluations to authenticated;

-- 확인: 결과에 signature 한 줄이 나오면 성공입니다.
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'interview_evaluations' and column_name = 'signature';
