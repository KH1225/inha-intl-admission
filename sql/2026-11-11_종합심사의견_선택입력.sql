-- 면접평가표: 국제교류원장 종합심사의견을 필수 → 선택으로 변경 (2026-11-11)
-- Supabase > SQL Editor 에 통째로 붙여 넣고 Run 을 한 번 누르세요.
-- DB 함수 안의 "종합 심사의견을 입력해야 합니다" 검사만 꺼 줍니다. 나머지 검사는 그대로입니다.
-- 여러 번 실행해도 안전합니다.

do $$
declare
  r       record;
  def     text;
  new_def text;
  n       int := 0;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prosrc ~ '심사\s*의견을\s*입력해야'
  loop
    def := pg_get_functiondef(r.oid);
    -- raise exception '...심사의견을 입력해야...' ;  →  null;
    new_def := regexp_replace(def,
      'raise\s+exception\s+''[^'']*심사\s*의견을\s*입력해야[^'']*''[^;]*;',
      'null; -- 종합심사의견 선택 입력으로 변경 (2026-11-11)', 'gi');
    -- raise exception using message = '...' 형태도 처리
    new_def := regexp_replace(new_def,
      'raise\s+exception\s+using\s+message\s*=\s*''[^'']*심사\s*의견을\s*입력해야[^'']*''[^;]*;',
      'null; -- 종합심사의견 선택 입력으로 변경 (2026-11-11)', 'gi');
    if new_def <> def then
      execute new_def;
      n := n + 1;
      raise notice '함수 % 를 수정했습니다.', r.proname;
    else
      raise notice '함수 % 에서 문구는 찾았지만 형태가 달라 수정하지 못했습니다. 아래 확인 결과를 Claude에게 보여 주세요.', r.proname;
    end if;
  end loop;
  if n = 0 then
    raise notice '수정한 함수가 없습니다. (이미 수정됐거나 형태가 다릅니다)';
  end if;
end $$;

-- 확인: 아래 결과가 비어 있으면 성공입니다. (필수 검사가 더 이상 없음)
select p.proname as 남아있는_함수
from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
where ns.nspname = 'public'
  and p.prosrc ~* 'raise\s+exception[^;]*심사\s*의견을\s*입력해야';
