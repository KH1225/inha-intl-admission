-- 학점 인정 심사: 편입생 성적증명서 파일 올리기 (2026-11-12)
-- 올리기·지우기: 총괄관리자, 국제교류팀 / 보기: + 국제교류원장, 학과장(자기 학과 지원자만)
-- 파일은 입학지원서와 같은 비공개 저장소(applications)에 보관합니다. PDF·JPG·PNG, 20MB 이하.
-- (먼저 sql/2026-11-11_입학지원서_PDF.sql 이 실행되어 있어야 합니다)
-- Supabase > SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전합니다.

-- 1) 저장소가 사진 파일(JPG·PNG)도 받도록
update storage.buckets
   set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png']
 where id = 'applications';

-- 2) 학생별 성적증명서 파일 기록 (한 학생 여러 파일)
create table if not exists public.credit_transcripts (
  id           bigint generated always as identity primary key,
  applicant_id text not null,
  path         text not null unique,
  file_name    text,
  mime         text,
  size_bytes   bigint,
  uploaded_by  uuid,
  uploaded_at  timestamptz not null default now()
);
create index if not exists credit_transcripts_app_idx on public.credit_transcripts (applicant_id);
alter table public.credit_transcripts enable row level security;

grant select, insert, update, delete on public.credit_transcripts to authenticated;
drop policy if exists credit_transcripts_select on public.credit_transcripts;
drop policy if exists credit_transcripts_insert on public.credit_transcripts;
drop policy if exists credit_transcripts_delete on public.credit_transcripts;
create policy credit_transcripts_select on public.credit_transcripts for select to authenticated using (public.can_view_applicant_file(applicant_id));
create policy credit_transcripts_insert on public.credit_transcripts for insert to authenticated with check (public.can_edit_applicant_file());
create policy credit_transcripts_delete on public.credit_transcripts for delete to authenticated using (public.can_edit_applicant_file());

-- 확인: credit_transcripts 와 사진 형식이 포함된 목록이 나오면 성공입니다.
select 'credit_transcripts' as 확인, (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'credit_transcripts')::text as 값
union all
select 'applications 허용 형식', array_to_string(allowed_mime_types, ', ') from storage.buckets where id = 'applications';
