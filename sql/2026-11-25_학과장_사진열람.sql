-- 학과장·국제교류원장 로그인 시 지원자 사진 보이기 (2026-11-25)
-- Supabase > SQL Editor 에 붙여 넣고 Run. 여러 번 실행해도 안전합니다.
--
-- 화면은 이미 사진을 보여 주도록 되어 있지만, 사진 저장소(photos)의 열람 규칙에
-- 학과장(dept)이 빠져 있으면 사진 주소를 받지 못해 이름 첫 글자만 보입니다.
-- 이 SQL은 '열람' 규칙만 하나 추가합니다. 사진 올리기·바꾸기·삭제 권한은 그대로입니다.
--   - 총괄관리자·국제교류팀·조회전용·국제교류원장: 모든 지원자 사진
--   - 학과장: 자기 학과 지원자 사진만
-- 사진 파일 경로는 {지원자ID}.jpg 입니다.

create or replace function public.can_view_applicant_photo(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and (
      p.role in ('admin', 'staff', 'viewer', 'director')
      or (p.role = 'dept' and exists (
        select 1 from public.applicants a
        where a.id::text = split_part(p_name, '.', 1)
          and a.department_id = p.department_id))
    ))
$$;
revoke all on function public.can_view_applicant_photo(text) from public;
grant execute on function public.can_view_applicant_photo(text) to authenticated;

drop policy if exists photos_read_by_role on storage.objects;
create policy photos_read_by_role on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.can_view_applicant_photo(name));

-- 확인: photos 저장소의 규칙 목록이 나옵니다. photos_read_by_role 이 보이면 성공입니다.
select policyname as 규칙, cmd as 동작
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and (qual like '%photos%' or with_check like '%photos%')
 order by policyname;
