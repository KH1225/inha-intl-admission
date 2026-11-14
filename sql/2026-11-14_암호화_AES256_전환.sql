-- 여권번호·외국인등록번호 암호화를 AES-128 → AES-256 으로 올립니다 (2026-11-14)
-- · 앞으로 저장되는 번호는 AES-256 으로 암호화됩니다.
-- · 이미 저장된 번호도 모두 AES-256 으로 다시 암호화합니다 (원문은 화면·DB 어디에도 남지 않습니다).
-- · 전부 한 번에 처리되며, 다시 암호화한 값이 원래 번호와 하나라도 다르면 자동으로 전부 취소됩니다(자료 안전).
-- · 열쇠(Vault의 pii_key)와 '원문 보기'는 그대로이고, 복호화(pii_decrypt)는 두 방식을 모두 읽을 수 있어 바꾸지 않습니다.
-- Supabase > SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전합니다.

do $$
declare
  ext_schema text;
  def        text;
  n_before   int;
  n_bad      int;
begin
  -- 1) pgcrypto 가 설치된 스키마
  select n.nspname into ext_schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgcrypto';
  if ext_schema is null then raise exception 'pgcrypto 가 없습니다'; end if;

  -- 2) AES-256 으로 암호화하는 도우미 함수
  execute format($f$
    create or replace function public.pii_pgp_aes256(d text, k text) returns bytea
    language sql immutable set search_path = '' as
    'select %I.pgp_sym_encrypt(d, k, ''cipher-algo=aes256'')'
  $f$, ext_schema);
  revoke all on function public.pii_pgp_aes256(text, text) from public, anon, authenticated;

  -- 3) 기존 pii_encrypt 의 pgp_sym_encrypt 호출만 도우미로 바꿔 다시 만들기 (열쇠를 가져오는 방법 등 나머지는 그대로)
  def := pg_get_functiondef('public.pii_encrypt(text)'::regprocedure);
  if def ilike '%pii_pgp_aes256%' then
    raise notice 'pii_encrypt 는 이미 AES-256 입니다';
  else
    if def !~* 'pgp_sym_encrypt\(' then raise exception 'pii_encrypt 에서 pgp_sym_encrypt 를 찾지 못했습니다 — 바꾸지 않았습니다'; end if;
    def := regexp_replace(def, '([A-Za-z_]+\.)?pgp_sym_encrypt\(', 'public.pii_pgp_aes256(', 'gi');
    execute def;
  end if;

  -- 4) 저장된 번호를 모두 다시 암호화하고, 원래 번호와 같은지 하나하나 확인
  create temp table _pii_check on commit drop as
    select id, public.pii_decrypt(passport_no_enc) as p, public.pii_decrypt(alien_reg_no_enc) as r
    from public.applicants where passport_no_enc is not null or alien_reg_no_enc is not null;
  get diagnostics n_before = row_count;

  alter table public.applicants disable trigger user;   -- 상태 이력·수정시각 등 자동 처리가 돌지 않게
  update public.applicants a
     set passport_no_enc  = case when c.p is null then a.passport_no_enc  else public.pii_encrypt(c.p) end,
         alien_reg_no_enc = case when c.r is null then a.alien_reg_no_enc else public.pii_encrypt(c.r) end
    from _pii_check c where c.id = a.id;
  alter table public.applicants enable trigger user;

  select count(*) into n_bad from public.applicants a join _pii_check c on c.id = a.id
   where public.pii_decrypt(a.passport_no_enc) is distinct from c.p
      or public.pii_decrypt(a.alien_reg_no_enc) is distinct from c.r;
  if n_bad > 0 then
    raise exception '다시 암호화한 값 % 건이 원래와 달라 전부 취소했습니다 (자료는 그대로입니다)', n_bad;
  end if;
  raise notice '% 명의 번호를 AES-256 으로 다시 암호화했습니다', n_before;
end $$;

-- 확인: 모든 행이 'AES-256' 으로 나오면 성공입니다 (OpenPGP 4번째 바이트: 9 = AES-256, 7 = AES-128)
select case get_byte(passport_no_enc, 3) when 9 then 'AES-256' when 7 then 'AES-128' else '기타(' || get_byte(passport_no_enc, 3) || ')' end as 여권번호_암호화,
       count(*) as 명
from public.applicants where passport_no_enc is not null
group by 1;
