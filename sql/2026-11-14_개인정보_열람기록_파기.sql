-- 개인정보 보호: 열람·반출 기록 + 보유기간 경과 자료 파기 (2026-11-14)
-- 1) access_log      : 입학지원서·성적증명서 열람, 엑셀 내려받기, 인쇄 기록 (기록은 누구나 남기고, 조회는 총괄관리자만)
-- 2) get_access_logs : 총괄관리자용 열람 기록 조회 (기존 '원문 보기' 기록 pii_access_log 포함)
-- 3) purge_*         : 보유기간이 지난 학기의 지원자 자료 파기 + 파기 대장(purge_log)
-- Supabase > SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전합니다.

-- 1) 열람·반출 기록
create table if not exists public.access_log (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid(),
  action       text not null,
  applicant_id uuid,
  detail       text,
  accessed_at  timestamptz not null default now()
);
create index if not exists access_log_at_idx on public.access_log (accessed_at desc);
alter table public.access_log enable row level security;
revoke all on public.access_log from anon, authenticated;
grant insert on public.access_log to authenticated;
grant usage on sequence public.access_log_id_seq to authenticated;
drop policy if exists access_log_insert on public.access_log;
create policy access_log_insert on public.access_log for insert to authenticated
  with check (user_id = auth.uid() and length(action) <= 100 and (detail is null or length(detail) <= 500));
-- 수정·삭제 정책은 만들지 않습니다 → 기록은 아무도 고치거나 지울 수 없습니다 (조회는 아래 함수로만)

-- 2) 총괄관리자 조회
create or replace function public.get_access_logs(p_from date, p_to date)
returns table (at timestamptz, user_name text, action text, receipt_no text, name_ko text, detail text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.current_role_name(), '') <> 'admin' then raise exception '총괄관리자만 볼 수 있습니다'; end if;
  return query
  select x.at, coalesce(p.display_name, '(삭제된 계정)'), x.action, a.receipt_no, a.name_ko, x.detail
  from (
    select l.accessed_at as at, l.user_id, '여권·외국인등록번호 원문 보기'::text as action, l.applicant_id, null::text as detail from public.pii_access_log l
    union all
    select l.accessed_at, l.user_id, l.action, l.applicant_id, l.detail from public.access_log l
  ) x
  left join public.profiles p on p.id = x.user_id
  left join public.applicants a on a.id = x.applicant_id
  where x.at >= p_from and x.at < (p_to + 1)
  order by x.at desc
  limit 3000;
end $$;
revoke all on function public.get_access_logs(date, date) from public, anon;
grant execute on function public.get_access_logs(date, date) to authenticated;

-- 3) 보유기간 경과 자료 파기
create table if not exists public.purge_log (
  id          bigint generated always as identity primary key,
  term_label  text not null,
  n_applicants int not null,
  keep_years  int not null,
  purged_by   uuid default auth.uid(),
  purged_at   timestamptz not null default now()
);
alter table public.purge_log enable row level security;
revoke all on public.purge_log from anon, authenticated;

-- 학기별 지원자 수 + 파기 대장 (총괄관리자)
create or replace function public.purge_preview()
returns table (term_id text, year int, semester text, n int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.current_role_name(), '') <> 'admin' then raise exception '총괄관리자만 할 수 있습니다'; end if;
  return query select t.id::text, t.year::int, t.semester::text, (select count(*)::int from public.applicants a where a.term_id = t.id)
    from public.terms t order by t.year, t.semester;
end $$;
create or replace function public.purge_history()
returns table (term_label text, n_applicants int, keep_years int, purged_by text, purged_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.current_role_name(), '') <> 'admin' then raise exception '총괄관리자만 할 수 있습니다'; end if;
  return query select l.term_label, l.n_applicants, l.keep_years, coalesce(p.display_name, '-'), l.purged_at
    from public.purge_log l left join public.profiles p on p.id = l.purged_by order by l.purged_at desc;
end $$;
-- 파기할 학기의 사진 경로 (저장소 파일은 화면에서 먼저 지웁니다)
create or replace function public.purge_term_files(p_term text)
returns table (applicant_id uuid, photo_path text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.current_role_name(), '') <> 'admin' then raise exception '총괄관리자만 할 수 있습니다'; end if;
  return query select a.id, a.photo_path from public.applicants a where a.term_id::text = p_term;
end $$;
-- 파기 실행: 보유기간(년)이 지난 학기만, 열람 기록(access_log·pii_access_log)과 파기 대장은 남깁니다
create or replace function public.purge_term(p_term text, p_keep_years int)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_year int; v_label text; v_ids text[]; r record; pass int; left_n int; n int;
begin
  if coalesce(public.current_role_name(), '') <> 'admin' then raise exception '총괄관리자만 파기할 수 있습니다'; end if;
  if p_keep_years is null or p_keep_years < 1 then raise exception '보유기간을 1년 이상으로 정하세요'; end if;
  select t.year, t.year || '학년도 ' || t.semester into v_year, v_label from public.terms t where t.id::text = p_term;
  if v_year is null then raise exception '학기를 찾을 수 없습니다'; end if;
  if v_year + p_keep_years > extract(year from now())::int then
    raise exception '% 자료는 보유기간(%년)이 아직 지나지 않았습니다 (% 년 이후 파기 가능)', v_label, p_keep_years, v_year + p_keep_years;
  end if;
  select array_agg(id::text) into v_ids from public.applicants where term_id::text = p_term;
  if v_ids is null then
    insert into public.purge_log (term_label, n_applicants, keep_years) values (v_label, 0, p_keep_years);
    return 0;
  end if;
  for pass in 1..4 loop
    left_n := 0;
    for r in
      select c.table_name from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
      where c.table_schema = 'public' and c.column_name = 'applicant_id'
        and c.table_name not in ('applicants', 'access_log', 'pii_access_log')
    loop
      begin
        execute format('delete from public.%I where applicant_id::text = any($1)', r.table_name) using v_ids;
      exception when foreign_key_violation then left_n := left_n + 1;
      end;
    end loop;
    exit when left_n = 0;
  end loop;
  delete from public.applicants where id::text = any(v_ids);
  get diagnostics n = row_count;
  insert into public.purge_log (term_label, n_applicants, keep_years) values (v_label, n, p_keep_years);
  return n;
end $$;
revoke all on function public.purge_preview() from public, anon;
revoke all on function public.purge_history() from public, anon;
revoke all on function public.purge_term_files(text) from public, anon;
revoke all on function public.purge_term(text, int) from public, anon;
grant execute on function public.purge_preview() to authenticated;
grant execute on function public.purge_history() to authenticated;
grant execute on function public.purge_term_files(text) to authenticated;
grant execute on function public.purge_term(text, int) to authenticated;

-- 확인: 아래 세 줄이 나오면 성공입니다.
select 'access_log' as 확인 from information_schema.tables where table_schema = 'public' and table_name = 'access_log'
union all select 'purge_log' from information_schema.tables where table_schema = 'public' and table_name = 'purge_log'
union all select 'get_access_logs' from pg_proc where proname = 'get_access_logs';
