-- 여권번호·여권만료일·외국인등록번호 삭제 (2026-11-14)
-- 개인정보 보호 조치: 현황판에서 이 정보를 더 이상 수집·보관하지 않습니다. (비자종류는 남깁니다)
--
-- 하는 일
--   1) 지원자 표의 여권·외국인등록번호 관련 칸(원문·암호문·뒤 4자리·만료일 등)을 통째로 삭제
--   2) 암호화 자동 처리(트리거)와 원문 보기·여권번호 검색·암호화 함수 삭제
--   3) Vault 의 암호화 열쇠 삭제
--   4) 파기 대장에 기록
--   (열람 기록 pii_access_log 는 기록 보존을 위해 남깁니다. 번호 자체는 들어 있지 않습니다.)
--
-- 안전장치: 예상하지 못한 다른 함수가 이 칸이나 암호화 함수를 쓰고 있으면, 아무것도 바꾸지 않고 멈춘 뒤 그 이름을 알려 줍니다.
-- 전부 한 번에 처리되며 중간에 오류가 나면 모두 취소됩니다. 여러 번 실행해도 안전합니다.
-- ※ 삭제한 번호는 되살릴 수 없습니다.

do $$
declare
  v_cols     text[];
  v_kill     oid[] := '{}';
  v_kill_src text := '';
  v_other    text;
  v_n        int := 0;
  r          record;
begin
  -- 지울 칸
  select coalesce(array_agg(column_name::text), '{}') into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'applicants'
     and (column_name ilike '%passport%' or column_name ilike '%alien%');

  -- 지울 함수: 알려진 이름 + 지원자 표에서 여권·암호화를 처리하는 트리거 함수
  for r in
    select p.oid, p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and p.proname in ('get_applicant_secrets', 'find_by_passport', 'pii_encrypt', 'pii_decrypt', 'pii_pgp_aes256', 'pii_hmac')
    union
    select p.oid, p.proname, p.prosrc from pg_trigger t join pg_proc p on p.oid = t.tgfoid
     where t.tgrelid = 'public.applicants'::regclass and not t.tgisinternal
       and (p.prosrc ~* '(passport|alien|pii_encrypt|pii_hmac)')
  loop
    if r.proname !~* '(pii|passport|alien|encrypt|secret)' then
      raise exception '트리거 함수 "%" 가 여권번호 처리와 다른 일을 함께 하는 것 같아 멈췄습니다 (아무것도 바뀌지 않음). 이 메시지를 캡처해 보내 주세요.', r.proname;
    end if;
    v_kill := v_kill || r.oid;
    v_kill_src := v_kill_src || ' ' || r.prosrc;
  end loop;

  -- 다른 함수가 이 칸이나 암호화 함수를 쓰는지 확인
  select string_agg(distinct p.proname, ', ') into v_other
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and not (p.oid = any (v_kill))
     and p.prosrc ~* '(passport|alien_reg|pii_encrypt|pii_decrypt|pii_hmac|pii_pgp_aes256)';
  if v_other is not null then
    raise exception '다음 함수가 아직 여권번호 칸을 쓰고 있어 멈췄습니다 (아무것도 바뀌지 않음): %. 이 메시지를 캡처해 보내 주세요.', v_other;
  end if;

  -- 파기 대장용: 번호가 들어 있던 지원자 수
  if array_length(v_cols, 1) > 0 then
    execute 'select count(*) from public.applicants where ' ||
            (select string_agg(format('%I is not null', c), ' or ') from unnest(v_cols) c)
      into v_n;
  end if;

  -- 1) 트리거 삭제
  for r in
    select t.tgname from pg_trigger t
     where t.tgrelid = 'public.applicants'::regclass and not t.tgisinternal and t.tgfoid = any (v_kill)
  loop
    execute format('drop trigger %I on public.applicants', r.tgname);
  end loop;

  -- 2) 함수 삭제
  for r in select p.oid::regprocedure as sig from pg_proc p where p.oid = any (v_kill) loop
    execute format('drop function %s', r.sig);
  end loop;

  -- 3) 칸 삭제 (관련 색인·중복 금지 규칙도 함께 삭제됨)
  if array_length(v_cols, 1) > 0 then
    execute 'alter table public.applicants ' ||
            (select string_agg(format('drop column %I', c), ', ') from unnest(v_cols) c);
  end if;

  -- 4) Vault 열쇠 삭제 (지운 함수만 쓰던 열쇠)
  begin
    for r in select id, name from vault.secrets
              where name is not null and position(name in v_kill_src) > 0 loop
      if not exists (select 1 from pg_proc p where p.prosrc like '%' || r.name || '%') then
        delete from vault.secrets where id = r.id;
        raise notice 'Vault 열쇠 % 삭제', r.name;
      end if;
    end loop;
  exception when others then
    raise notice 'Vault 열쇠는 지우지 못했습니다(%). Supabase > Project Settings > Vault 에서 직접 지워 주세요.', sqlerrm;
  end;

  -- 5) 파기 대장
  if array_length(v_cols, 1) > 0 and to_regclass('public.purge_log') is not null then
    insert into public.purge_log (term_label, n_applicants, keep_years)
    values ('여권번호·여권만료일·외국인등록번호 전체 삭제 (수집 중단)', v_n, 0);
  end if;

  raise notice '칸 %개 삭제, 함수 %개 삭제, 대상 지원자 %명', coalesce(array_length(v_cols, 1), 0), coalesce(array_length(v_kill, 1), 0), v_n;
end $$;

-- 확인: 두 값이 모두 0 이면 성공입니다.
select '남은 여권·외국인등록번호 칸' as 확인,
       (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'applicants'
         and (column_name ilike '%passport%' or column_name ilike '%alien%'))::text as 값
union all
select '남은 암호화·원문보기 함수',
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private')
         and p.proname in ('get_applicant_secrets', 'find_by_passport', 'pii_encrypt', 'pii_decrypt', 'pii_pgp_aes256', 'pii_hmac'))::text;
