-- 입학지원서 PDF (입학지원서 + 자기소개서) 업로드·열람 (2026-11-11)
-- 올리기·바꾸기·지우기: 총괄관리자, 국제교류팀
-- 보기: 총괄관리자, 국제교류팀, 국제교류원장, 학과장(자기 학과 지원자만)
-- Supabase > SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전합니다.

-- 1) 비공개 저장소 (PDF만, 20MB 이하)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('applications', 'applications', false, 20971520, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 2) 지원자별 파일 기록
create table if not exists public.applicant_files (
  applicant_id text primary key,
  path         text not null,
  file_name    text,
  size_bytes   bigint,
  uploaded_by  uuid,
  uploaded_at  timestamptz not null default now()
);
alter table public.applicant_files enable row level security;

-- 3) 권한 확인 함수
create or replace function public.can_view_applicant_file(p_applicant text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and (
      p.role in ('admin', 'staff', 'director')
      or (p.role = 'dept' and exists (
        select 1 from public.applicants a where a.id::text = p_applicant and a.department_id = p.department_id))
    ))
$$;
create or replace function public.can_edit_applicant_file()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active and p.role in ('admin', 'staff'))
$$;
revoke all on function public.can_view_applicant_file(text) from public;
revoke all on function public.can_edit_applicant_file() from public;
grant execute on function public.can_view_applicant_file(text) to authenticated;
grant execute on function public.can_edit_applicant_file() to authenticated;

-- 4) 파일 기록 표 규칙
grant select, insert, update, delete on public.applicant_files to authenticated;
drop policy if exists applicant_files_select on public.applicant_files;
drop policy if exists applicant_files_insert on public.applicant_files;
drop policy if exists applicant_files_update on public.applicant_files;
drop policy if exists applicant_files_delete on public.applicant_files;
create policy applicant_files_select on public.applicant_files for select to authenticated using (public.can_view_applicant_file(applicant_id));
create policy applicant_files_insert on public.applicant_files for insert to authenticated with check (public.can_edit_applicant_file());
create policy applicant_files_update on public.applicant_files for update to authenticated using (public.can_edit_applicant_file()) with check (public.can_edit_applicant_file());
create policy applicant_files_delete on public.applicant_files for delete to authenticated using (public.can_edit_applicant_file());

-- 5) 저장소 파일 규칙 (경로: {지원자ID}/application.pdf)
drop policy if exists applications_read   on storage.objects;
drop policy if exists applications_insert on storage.objects;
drop policy if exists applications_update on storage.objects;
drop policy if exists applications_delete on storage.objects;
create policy applications_read on storage.objects for select to authenticated
  using (bucket_id = 'applications' and public.can_view_applicant_file(split_part(name, '/', 1)));
create policy applications_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'applications' and public.can_edit_applicant_file());
create policy applications_update on storage.objects for update to authenticated
  using (bucket_id = 'applications' and public.can_edit_applicant_file())
  with check (bucket_id = 'applications' and public.can_edit_applicant_file());
create policy applications_delete on storage.objects for delete to authenticated
  using (bucket_id = 'applications' and public.can_edit_applicant_file());

-- 확인: applications 와 applicant_files 가 나오면 성공입니다.
select id as 확인 from storage.buckets where id = 'applications'
union all
select table_name from information_schema.tables where table_schema = 'public' and table_name = 'applicant_files';
