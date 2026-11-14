-- 입학지원서·성적증명서 업로드 기능 폐지 및 파일 삭제 (2026-11-14)
-- 개인정보 보호 조치: 원본 서류를 클라우드에 보관하지 않습니다.
--
-- ※ 실행 순서 (반드시 이 순서대로)
--   0) (보관이 필요하면) Supabase > Storage > applications 에서 파일을 내려받아 학교 서버에 암호화 보관
--   1) Supabase > Storage > applications 저장소 오른쪽 ⋯ 메뉴 > "Empty bucket" 으로 파일 전부 삭제
--      (Supabase는 SQL로 저장소 파일을 직접 지우는 것을 막아 두어서, 파일 삭제는 화면에서 해야 합니다)
--   2) 이 SQL 전체를 Supabase > SQL Editor 에 붙여 넣고 Run
--   3) Supabase > Storage > applications ⋯ 메뉴 > "Delete bucket" 으로 빈 저장소 삭제
--
-- 저장소에 파일이 하나라도 남아 있으면 아무것도 바꾸지 않고 멈춥니다. 여러 번 실행해도 안전합니다.

do $$
declare
  v_left  int := 0;
  v_n     int := 0;
begin
  select count(*) into v_left from storage.objects where bucket_id = 'applications';
  if v_left > 0 then
    raise exception '저장소(applications)에 파일이 %개 남아 있습니다. 먼저 Storage 화면에서 "Empty bucket"을 실행하세요.', v_left;
  end if;

  -- 파기 대장 기록 (파일이 있던 지원자 수)
  if to_regclass('public.applicant_files') is not null or to_regclass('public.credit_transcripts') is not null then
    execute format('select count(distinct applicant_id) from (%s) t',
      concat_ws(' union all ',
        case when to_regclass('public.applicant_files') is not null then 'select applicant_id from public.applicant_files' end,
        case when to_regclass('public.credit_transcripts') is not null then 'select applicant_id from public.credit_transcripts' end))
      into v_n;
    if to_regclass('public.purge_log') is not null then
      insert into public.purge_log (term_label, n_applicants, keep_years)
      values ('입학지원서·성적증명서 파일 전체 삭제 (업로드 기능 폐지)', v_n, 0);
    end if;
  end if;
end $$;

-- 저장소 파일 규칙 삭제
drop policy if exists applications_read   on storage.objects;
drop policy if exists applications_insert on storage.objects;
drop policy if exists applications_update on storage.objects;
drop policy if exists applications_delete on storage.objects;

-- 파일 기록 표 삭제
drop table if exists public.applicant_files;
drop table if exists public.credit_transcripts;

-- 파일 권한 확인 함수 삭제
drop function if exists public.can_view_applicant_file(text);
drop function if exists public.can_edit_applicant_file();

-- 확인: 세 값이 모두 0 이면 성공입니다. (저장소는 3단계에서 화면으로 삭제)
select '남은 파일' as 확인, (select count(*) from storage.objects where bucket_id = 'applications')::text as 값
union all
select '파일 기록 표', (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('applicant_files', 'credit_transcripts'))::text
union all
select '파일 규칙', (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'applications\_%')::text;
