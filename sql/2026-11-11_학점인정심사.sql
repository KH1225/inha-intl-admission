-- 편입학 학점인정심사 (2026-11-11)
-- 학과장: 자기 학과 편입학 지원자를 심사·제출(서명) — 제출 후에는 수정 불가
-- 총괄관리자·국제교류팀: 조회·수정, 제출 취소 / 국제교류원장: 조회
-- Supabase > SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전합니다.

-- 1) 학생별 심의 (지원자당 1건) — 학교 양식 「편입학 지원자 학점인정 심의」
create table if not exists public.credit_reviews (
  applicant_id  text primary key,
  prev_school   text,                 -- 전적교 대학명
  prev_year     int,                  -- 전적교 학년
  day_night     text default '주',     -- 본대학 주·야
  comment       text,                 -- 학점인정기준 및 심의의견
  review_date   date,                 -- 심의일
  submitted     boolean not null default false,
  submitted_at  timestamptz,
  signature     text check (signature is null or length(signature) < 200000),
  reviewer      uuid,
  reviewer_name text,                 -- 학과(부)장 이름 (서명란 표기)
  updated_at    timestamptz not null default now()
);

-- 2) 사정표: 전적교 이수 과목별 인정 여부
create table if not exists public.credit_review_courses (
  id            bigint generated always as identity primary key,
  applicant_id  text not null,
  seq           int not null default 0,
  category      text,                 -- 구분: 전공 / 교양 / (빈칸)
  course_name   text,                 -- 교과목명
  credits       numeric(4,1),         -- 학점
  recognized    boolean not null default false  -- 인정 여부
);
create index if not exists credit_review_courses_app_idx on public.credit_review_courses (applicant_id, seq);

alter table public.credit_reviews enable row level security;
alter table public.credit_review_courses enable row level security;

-- 3) 권한 확인 함수
create or replace function public.can_view_credit(p_applicant text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and (
      p.role in ('admin', 'staff', 'director')
      or (p.role = 'dept' and exists (
        select 1 from public.applicants a where a.id::text = p_applicant and a.department_id = p.department_id))))
$$;
create or replace function public.can_write_credit(p_applicant text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and (
      p.role in ('admin', 'staff')
      or (p.role = 'dept'
          and exists (select 1 from public.applicants a where a.id::text = p_applicant and a.department_id = p.department_id)
          and not exists (select 1 from public.credit_reviews r where r.applicant_id = p_applicant and r.submitted))))
$$;
revoke all on function public.can_view_credit(text) from public;
revoke all on function public.can_write_credit(text) from public;
grant execute on function public.can_view_credit(text) to authenticated;
grant execute on function public.can_write_credit(text) to authenticated;

-- 4) 규칙
grant select, insert, update, delete on public.credit_reviews to authenticated;
grant select, insert, update, delete on public.credit_review_courses to authenticated;

drop policy if exists credit_reviews_select on public.credit_reviews;
drop policy if exists credit_reviews_insert on public.credit_reviews;
drop policy if exists credit_reviews_update on public.credit_reviews;
drop policy if exists credit_reviews_delete on public.credit_reviews;
create policy credit_reviews_select on public.credit_reviews for select to authenticated using (public.can_view_credit(applicant_id));
create policy credit_reviews_insert on public.credit_reviews for insert to authenticated with check (public.can_write_credit(applicant_id));
create policy credit_reviews_update on public.credit_reviews for update to authenticated using (public.can_write_credit(applicant_id)) with check (public.can_view_credit(applicant_id));
create policy credit_reviews_delete on public.credit_reviews for delete to authenticated using (public.can_write_credit(applicant_id));

drop policy if exists credit_courses_select on public.credit_review_courses;
drop policy if exists credit_courses_insert on public.credit_review_courses;
drop policy if exists credit_courses_update on public.credit_review_courses;
drop policy if exists credit_courses_delete on public.credit_review_courses;
create policy credit_courses_select on public.credit_review_courses for select to authenticated using (public.can_view_credit(applicant_id));
create policy credit_courses_insert on public.credit_review_courses for insert to authenticated with check (public.can_write_credit(applicant_id));
create policy credit_courses_update on public.credit_review_courses for update to authenticated using (public.can_write_credit(applicant_id)) with check (public.can_write_credit(applicant_id));
create policy credit_courses_delete on public.credit_review_courses for delete to authenticated using (public.can_write_credit(applicant_id));

-- 확인: 두 표 이름이 나오면 성공입니다.
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('credit_reviews', 'credit_review_courses');
