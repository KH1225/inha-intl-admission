// 사이트 설정 (공개해도 안전한 값만 들어 있습니다. secret key / service_role key는 절대 넣지 마세요)
window.CONFIG = {
  SUPABASE_URL: 'https://hnxjjqjgtkqdnncimahb.supabase.co',
  SUPABASE_KEY: 'sb_publishable_5EJ8CuC_NbBJVyndDy585Q_H_AbmjRm',

  SCHOOL_KO: '인하공업전문대학',
  SCHOOL_EN: 'Inha Technical College',
  PRESIDENT_KO: '인하공업전문대학총장',
  PRESIDENT_EN: 'President of Inha Technical College',
  OIA_KO: '인하공업전문대학 국제교류원장',      // 등록금고지서·등록금납부확인서 발급자
  OIA_EN: 'Director of the Office of International Affairs, Inha Technical College',

  LOGO: 'assets/logo.png',      // 학교 로고 파일 (assets 폴더에 넣어 주세요)
  SEAL_BUCKET: 'seal',          // 직인은 Supabase Storage의 비공개 저장소 seal 에 seal.png 로 올립니다
  SEAL_FILE: 'seal.png',          // 총장 직인 (합격통지서)
  SEAL_OIA_FILE: 'seal_oia.png',  // 국제교류원장 직인 (등록금고지서·등록금납부확인서) — 같은 seal 저장소에 올립니다

  IDLE_MINUTES: 30,             // 아무 조작이 없으면 자동 로그아웃

  // 등록금고지서 하단 안내문 (학교 방침에 맞게 수정하세요)
  NOTICE_LINES: [
    { ko: '납부기간 내에 위 계좌로 해외송금하여 주시기 바랍니다.', en: 'Please remit the amount to the account above within the payment period.' },
    { ko: '송금인(Sender) 란에 지원자의 영문 성명과 수험번호를 정확히 기재하여 주시기 바랍니다.', en: "Please write the applicant's full English name and application number in the sender field." },
    { ko: '송금 수수료는 송금인이 부담하며, 학교에서 수령하는 금액이 위 납부금액과 일치해야 합니다.', en: 'Bank charges are borne by the sender; the amount received by the college must equal the amount due.' }
  ]
};
