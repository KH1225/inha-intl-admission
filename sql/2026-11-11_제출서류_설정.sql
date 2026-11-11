-- 제출서류 체크리스트 설정 (2026-11-11)
-- 입학구분(신입학/편입학) × 전형유형(순수외국인/전교육과정 해외이수)별로
-- 서류를 '필수 / 선택 / 제외'로 지정할 수 있게 칸을 추가하고, 총괄관리자가 사이트에서 고칠 수 있게 합니다.
-- Supabase > SQL Editor 에 통째로 붙여 넣고 Run 을 한 번 누르세요. 여러 번 실행해도 안전합니다.

alter table public.document_types add column if not exists show_t1 boolean not null default true;  -- 순수외국인에게 보임
alter table public.document_types add column if not exists show_t2 boolean not null default true;  -- 전교육과정 해외이수에게 보임
alter table public.document_types add column if not exists active  boolean not null default true;  -- 사용 여부

grant select, insert, update on public.document_types to authenticated;

-- 총괄관리자만 서류 목록을 추가·수정할 수 있도록 (조회 규칙은 기존 그대로)
drop policy if exists document_types_admin_insert on public.document_types;
drop policy if exists document_types_admin_update on public.document_types;
create policy document_types_admin_insert on public.document_types for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.active));
create policy document_types_admin_update on public.document_types for update to authenticated
  using      (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.active))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.active));

-- 확인: show_t1, show_t2, active 세 줄이 나오면 성공입니다.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'document_types' and column_name in ('show_t1', 'show_t2', 'active');
