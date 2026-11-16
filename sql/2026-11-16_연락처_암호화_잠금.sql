-- 이메일·연락처 평문 저장 금지 (2026-11-16)
-- 현황판 '연락처 암호화' 화면에서 "모두 암호화되어 있습니다"가 나온 뒤에 실행하세요.
-- 하는 일: 앞으로 이메일·연락처·추가 이메일·메일 기록 받는 주소에 평문이 들어오면 DB 가 저장을 거부합니다.
--          (옛 화면을 띄워 둔 PC 나 실수로 평문이 다시 쌓이는 것을 막습니다)
-- 안전장치: 아직 평문이 하나라도 남아 있으면 아무것도 바꾸지 않고 멈춥니다. 여러 번 실행해도 안전합니다.
-- 되돌리기(문제 생길 때): alter table public.applicants drop constraint applicants_pii_encrypted;
--                          alter table public.mail_logs  drop constraint mail_logs_to_email_encrypted;

do $$
declare
  has_cc boolean := exists (select 1 from information_schema.columns
                             where table_schema = 'public' and table_name = 'applicants' and column_name = 'cc_emails');
  n_app int; n_log int;
begin
  execute 'select count(*) from public.applicants where '
       || '(email is not null and email <> '''' and email not like ''enc:v1:%'') '
       || 'or (phone is not null and phone <> '''' and phone not like ''enc:v1:%'')'
       || case when has_cc then ' or (cc_emails is not null and cc_emails <> '''' and cc_emails not like ''enc:v1:%'')' else '' end
    into n_app;
  select count(*) into n_log from public.mail_logs where to_email is not null and to_email not like 'enc:v1:%';
  if n_app > 0 or n_log > 0 then
    raise exception '아직 평문이 남아 있어 멈췄습니다 (지원자 %명, 메일 기록 %건). 현황판 > 연락처 암호화 > 지금 암호화 를 먼저 눌러 주세요.', n_app, n_log;
  end if;

  -- 빈 문자열은 비어 있음(null)으로 정리
  update public.applicants set email = null where email = '';
  update public.applicants set phone = null where phone = '';
  if has_cc then execute 'update public.applicants set cc_emails = null where cc_emails = '''''; end if;

  alter table public.applicants drop constraint if exists applicants_pii_encrypted;
  execute 'alter table public.applicants add constraint applicants_pii_encrypted check ('
       || '(email is null or email like ''enc:v1:%'') and (phone is null or phone like ''enc:v1:%'')'
       || case when has_cc then ' and (cc_emails is null or cc_emails like ''enc:v1:%'')' else '' end
       || ')';

  alter table public.mail_logs drop constraint if exists mail_logs_to_email_encrypted;
  alter table public.mail_logs add constraint mail_logs_to_email_encrypted check (to_email is null or to_email like 'enc:v1:%');

  raise notice '평문 저장 금지 규칙을 걸었습니다.';
end $$;

-- 확인: 두 줄이 나오면 성공입니다.
select conrelid::regclass as 표, conname as 규칙 from pg_constraint
where conname in ('applicants_pii_encrypted', 'mail_logs_to_email_encrypted');
