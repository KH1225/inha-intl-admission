/* 평가자 체험용 Supabase 모의 클라이언트 + 가상 데이터
   - 실제 서버(DB)에 전혀 접속하지 않습니다. 모든 변경은 브라우저 메모리에만 있고 새로고침하면 처음 상태로 돌아갑니다.
   - 체험 계정: 9001(총괄관리자 체험), 9002(학과장 체험) / 비밀번호 itc-demo-2026 */
(function () {
  const svgUrl = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  function avatar(i, female) {
    const skins = ['#f1c9a5', '#e8b98f', '#d9a37a', '#f3d2b3', '#c98e64'];
    const hairs = ['#2b2118', '#3b2a1e', '#1d1d1f', '#5a3b25', '#2f2a26'];
    const bgs = ['#e8eef9', '#eef3ea', '#f6eee6', '#efeaf6', '#e6f2f4'];
    const sk = skins[i % 5], hr = hairs[(i * 3) % 5], bg = bgs[(i * 2) % 5];
    const hair = female
      ? `<path d="M60 52c-26 0-34 20-34 44v40h68V96c0-24-8-44-34-44z" fill="${hr}"/>`
      : `<path d="M34 78c0-20 12-30 26-30s26 10 26 30c-6-8-14-12-26-12s-20 4-26 12z" fill="${hr}"/>`;
    return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160"><rect width="120" height="160" fill="${bg}"/>${hair}
      <path d="M14 160c4-28 22-40 46-40s42 12 46 40z" fill="#30496e"/><rect x="51" y="104" width="18" height="20" fill="${sk}"/>
      <ellipse cx="60" cy="84" rx="23" ry="27" fill="${sk}"/>${female ? '' : `<path d="M37 76c2-16 12-24 23-24s21 8 23 24c-6-7-13-10-23-10s-17 3-23 10z" fill="${hr}"/>`}
      <circle cx="51" cy="84" r="2.4" fill="#2b2b2b"/><circle cx="69" cy="84" r="2.4" fill="#2b2b2b"/><path d="M53 97q7 5 14 0" stroke="#9a5b45" stroke-width="2" fill="none"/></svg>`);
  }
  const SEAL = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect x="8" y="8" width="104" height="104" rx="6" fill="none" stroke="#c8102e" stroke-width="7"/>
    <text x="60" y="56" text-anchor="middle" font-size="26" font-weight="700" fill="#c8102e" font-family="sans-serif">시연용</text>
    <text x="60" y="88" text-anchor="middle" font-size="22" font-weight="700" fill="#c8102e" font-family="sans-serif">직인</text></svg>`);

  function makeSig() {
    const c = document.createElement('canvas'); c.width = 300; c.height = 100; const g = c.getContext('2d');
    g.strokeStyle = '#111'; g.lineWidth = 4; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath();
    [[20, 70], [45, 25], [60, 75], [85, 20], [105, 72], [135, 35], [160, 68], [190, 30], [220, 62], [250, 45]].forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke(); return c.toDataURL('image/png');
  }
  const T = { id: 1, year: 2027, semester: '전기', name: '2027학년도 전기', is_current: true, first_tuition: 2450000, later_tuition: 2450000,
    apply_start: '2026-10-15', apply_end: '2026-11-20', interview_start: '2026-11-24', interview_end: '2026-11-27', announce_date: '2026-12-04',
    register_start: '2026-12-07', register_end: '2026-12-18', entry_date: '2027-03-02',
    bank_name: 'DEMO BANK (시연용)', account_holder: 'DEMO COLLEGE', account_no: '000-000000-00-000', swift_code: 'DEMOKRXX', bank_address: '시연용 주소 (Sample Address)' };
  const DEPTS = [
    ['항공운항과', 'Department of Flight Operation'], ['항공경영학과', 'Department of Aviation Management'], ['호텔경영학과', 'Department of Hotel Management'],
    ['AI소프트웨어학과', 'Department of AI Software'], ['조선기계공학과', 'Department of Naval Architecture & Mechanical Engineering'],
    ['관광경영학과', 'Department of Tourism Management'], ['디지털마케팅과', 'Department of Digital Marketing']
  ].map(([k, e], i) => ({ id: i + 1, name_ko: k, name_en: e, sort_order: i + 1, program_type: '전문학사', active: true }));

  // 가짜 지원자 (이름·학교 모두 시연용)
  const P = [
    ['아마노 유키', 'AMANO YUKI', '여', '2003-05-11', '일본', '편입학', 1, 'T2', '협약학교 추천', 4, 'D-4', '면접심사', 'TOPIK', 2],
    ['타나카 미오', 'TANAKA MIO', '여', '2004-02-19', '일본', '편입학', 1, 'T2', '개별지원', 3, null, '면접심사', null, 2],
    ['누르벡 알리', 'NURBEK ALI', '남', '2006-07-03', '우즈베키스탄', '신입학', 5, 'T1', '유학원', 2, 'D-4', '서류심사', null],
    ['사리바예프 티무르', 'SARIBAYEV TIMUR', '남', '2005-11-28', '우즈베키스탄', '신입학', 5, 'T1', '유학원', 2, null, '서류심사', null],
    ['응우옌 탄', 'NGUYEN THANH', '남', '2006-01-14', '베트남', '신입학', 4, 'T2', '개별지원', 3, 'D-4', '면접심사', null],
    ['바야르 소롱고', 'BAYAR SOLONGO', '여', '2004-07-16', '몽골', '신입학', 3, 'T2', '개별지원', 4, 'D-2', '등록완료', 'TOPIK'],
    ['아이다 쿠바토바', 'AIDA KUBATOVA', '여', '2005-03-02', '키르기스스탄', '신입학', 3, 'T1', '유학원', 3, 'D-2', '등록완료', null],
    ['레 티 하', 'LE THI HA', '여', '2006-09-21', '베트남', '신입학', 6, 'T2', '개별지원', 2, 'D-4', '최종합격', null],
    ['사이토 하루카', 'SAITO HARUKA', '여', '2004-12-05', '일본', '편입학', 2, 'T2', '개별지원', 4, null, '면접심사', null, 2],
    ['비크람 타파', 'VIKRAM THAPA', '남', '2005-06-30', '네팔', '신입학', 4, 'T1', '유학원', 3, 'D-4', '최종합격', null],
    ['리 하오란', 'LI HAORAN', '남', '2006-04-08', '중국', '신입학', 7, 'T1', '개별지원', 5, null, '서류심사', 'TOPIK'],
    ['아지즈 카리모프', 'AZIZ KARIMOV', '남', '2005-08-17', '우즈베키스탄', '신입학', 6, 'T1', '유학원', 2, 'D-4', '서류심사', null],
    ['초이 바트', 'CHOI BAT', '남', '2004-10-09', '몽골', '신입학', 4, 'T2', '개별지원', 3, null, '접수취소', null]
  ];
  const APPS = P.map((p, i) => ({
    id: 'a' + (i + 1), term_id: 1, receipt_no: `ITC-2027-${String(i + 1).padStart(3, '0')}`, name_ko: p[0], name_en: p[1], gender: p[2], birth_date: p[3],
    nationality: p[4], admission_kind: p[5], transfer_year: p[13] || null, department_id: p[6], qualification_code: p[7], route: p[8],
    agency_id: p[8] === '유학원' ? 1 : null, partner_school_id: p[8] === '협약학교 추천' ? 1 : null, topik_level: p[9], visa_type: p[10],
    email: `student${i + 1}@example.com`, phone: '010-0000-0000', high_school: 'Sample High School', gpa: null, dorm_application: i % 3 === 0,
    dorm_room: i === 5 ? '16-2B' : null, status: p[11], scholarship_type: p[12] ? 'TOPIK 우수' : null, scholarship_pct: p[12] ? 30 : 0,
    scholarship_amount: p[12] ? 735000 : 0, scholarship_source: p[12] ? '자동' : null, memo: null, photo_path: `a${i + 1}.jpg`,
    created_at: `2026-11-${String(2 + i).padStart(2, '0')}T10:00:00+09:00`, updated_at: '2026-11-14T10:00:00+09:00',
    domestic_hs: false, cc_emails: i === 0 ? 'parent@example.com' : null, prev_university: p[5] === '편입학' ? 'Sample College of Languages' : null
  }));
  const FEMALE = new Set(P.map((p, i) => (p[2] === '여' ? 'a' + (i + 1) : null)));

  const DB = {
    terms: [T], departments: DEPTS,
    qualifications: [{ code: 'T1', name_ko: '유형1 (부모 모두 외국인)' }, { code: 'T2', name_ko: '유형2 (해외 전 교육과정 이수)' }],
    agencies: [{ id: 1, name: '샘플 유학원' }], partner_schools: [{ id: 1, name: 'Sample College of Languages', active: true }],
    scholarship_rules: [], topik_rates: [], document_types: null, applicants: APPS,
    profiles: [{ id: 'u-admin', display_name: '평가위원(총괄관리자 체험)', role: 'admin', active: true, department_id: null, emp_no: '9001' },
      { id: 'u-dept', display_name: '평가위원(항공운항과 학과장 체험)', role: 'dept', active: true, department_id: 1, emp_no: '9002' },
      { id: 'u-staff', display_name: '국제교류팀 직원', role: 'staff', active: true, department_id: null, emp_no: '1003' }],
    interviews: [], interview_evaluations: [], payments: [], applicant_documents: [], credit_reviews: [], credit_review_courses: [],
    issued_documents: [], status_history: [], mail_logs: [], access_log: []
  };
  const ivApps = APPS.filter(a => ['면접심사', '최종합격', '불합격', '등록완료'].includes(a.status));
  const perDept = {};
  ivApps.forEach(a => { perDept[a.department_id] = (perDept[a.department_id] || 0) + 1;
    DB.interviews.push({ applicant_id: a.id, order_no: perDept[a.department_id], scheduled_at: `2026-11-2${4 + (perDept[a.department_id] % 3)}T10:${perDept[a.department_id] * 2}0:00+09:00` }); });
  ['a6', 'a7', 'a8', 'a10'].forEach(id => { ['학과장', '원장'].forEach(t => DB.interview_evaluations.push({ applicant_id: id, evaluator_type: t, item1: 'A', item2: 'A', item3: 'B', result: '합격', submitted: true, comment: '' })); });
  DB.payments.push({ applicant_id: 'a6', tuition_amount: 2450000, scholarship_amount: 735000, payable_amount: 1715000, paid_amount: 1595000, paid_at: null, memo: null });
  DB.payments.push({ applicant_id: 'a10', tuition_amount: 2450000, scholarship_amount: 0, payable_amount: 2450000, paid_amount: 0, paid_at: null, memo: null });
  DB.payments.push({ applicant_id: 'a7', tuition_amount: 2450000, scholarship_amount: 0, payable_amount: 2450000, paid_amount: 2450000, paid_at: '2026-12-09', memo: null });
  DB.payments.push({ applicant_id: 'a8', tuition_amount: 2450000, scholarship_amount: 0, payable_amount: 2450000, paid_amount: 0, paid_at: null, memo: null });
  const COURSES = [['Airline English I(항공 영어 I)', 2, '전공', true], ['Cabin Service Practice I(객실서비스 실습 I)', 2, '전공', true], ['Airline Studies(항공산업론)', 2, '전공', true],
    ['TOEIC Preparation I(TOEIC 대비 I)', 3, '교양', true], ['Business Manners I(비즈니스 매너 I)', 2, '교양', false], ['Japanese Expression(일본어 표현)', 2, '교양', false], ['Career Design I(진로 설계 I)', 2, '교양', false]];
  DB.credit_reviews.push({ applicant_id: 'a1', prev_major: 'Airline Industry (Cabin Attendant)', prev_year: 1, comment: '', submitted: true, submitted_at: '2026-11-14T10:00:00+09:00', signature: makeSig(), review_date: '2026-11-14', reviewer_name: '항공운항과 학과장' });
  COURSES.forEach((c, i) => DB.credit_review_courses.push({ applicant_id: 'a1', seq: i + 1, course_name: c[0], credits: c[1], category: c[2], recognized: c[3] }));

  function buildDocs() {
    if (DB.document_types || typeof STD_DOCS === 'undefined') return;
    const out = []; let n = 0;
    for (const [kind, list] of Object.entries(STD_DOCS)) list.forEach(([nm, s1, s2], i) => {
      out.push({ code: `D${++n}`, name_ko: nm, admission_kind: kind, sort_order: i + 1, active: true,
        show_t1: s1 !== 'X', show_t2: s2 !== 'X', required_t1: s1 === 'R', required_t2: s2 === 'R' });
    });
    DB.document_types = out;
    // 서류 체크: 지원자마다 몇 개만 빠지게
    APPS.forEach((a, k) => {
      const kind = a.admission_kind;
      out.filter(t => t.admission_kind === kind && (a.qualification_code === 'T2' ? t.required_t2 : t.required_t1)).forEach((t, j) => {
        const miss = (k === 2 && j === 3) || (k === 3 && j === 4) || (k === 9 && j === 2) || (k === 11 && (j === 1 || j === 4));
        if (!miss) DB.applicant_documents.push({ applicant_id: a.id, doc_code: t.code, received: true, received_at: '2026-11-10', note: null });
      });
    });
  }

  function Q(table) {
    const st = { table, op: 'select', filters: [], orders: [], range: null, single: false, maybe: false, row: null, head: false, count: null, limit: null };
    const rows = () => {
      buildDocs();
      if (table === 'interview_targets') {  // 학과장: 본인 소속학과 면접 대상자만 (실제 DB 권한 규칙과 같은 범위)
        const prof = DB.profiles.find(p => p.id === user.id) || {};
        return DB.applicants.filter(a => (!prof.department_id || a.department_id === prof.department_id) && DB.interviews.some(i => i.applicant_id === a.id));
      }
      return DB[table] || [];
    };
    const match = r => st.filters.every(f => f(r));
    const run = () => {
      let data = rows();
      if (st.op === 'insert') { const arr = [].concat(st.row).map(x => ({ id: x.id || `x${Math.random().toString(36).slice(2, 8)}`, ...x })); (DB[table] = DB[table] || []).push(...arr); data = arr; }
      else if (st.op === 'upsert') { const arr = [].concat(st.row); arr.forEach(x => { const k = st.onConflict || 'id'; const t = (DB[table] = DB[table] || []); const i = t.findIndex(r => r[k] === x[k]); if (i >= 0) Object.assign(t[i], x); else t.push(x); }); data = arr; }
      else if (st.op === 'update') { data = rows().filter(match); data.forEach(r => Object.assign(r, st.row)); }
      else if (st.op === 'delete') { const keep = rows().filter(r => !match(r)); data = rows().filter(match); DB[table] = keep; }
      else data = data.filter(match);
      for (const [c, asc] of st.orders.slice().reverse()) data = data.slice().sort((x, y) => (x[c] > y[c] ? 1 : x[c] < y[c] ? -1 : 0) * (asc ? 1 : -1));
      if (st.range) data = data.slice(st.range[0], st.range[1] + 1);
      if (st.limit != null) data = data.slice(0, st.limit);
      if (st.single || st.maybe) return { data: data[0] || null, error: null };
      return { data: st.head ? null : data, error: null, count: data.length };
    };
    const b = {
      select(c, o) { if (o && o.head) st.head = true; return b; },
      insert(r) { st.op = 'insert'; st.row = r; return b; }, upsert(r, o) { st.op = 'upsert'; st.row = r; st.onConflict = o && o.onConflict; return b; },
      update(r) { st.op = 'update'; st.row = r; return b; }, delete() { st.op = 'delete'; return b; },
      eq(k, v) { st.filters.push(r => String(r[k]) === String(v)); return b; }, neq(k, v) { st.filters.push(r => String(r[k]) !== String(v)); return b; },
      in(k, v) { const s = new Set(v.map(String)); st.filters.push(r => s.has(String(r[k]))); return b; },
      gte(k, v) { st.filters.push(r => r[k] >= v); return b; }, lte(k, v) { st.filters.push(r => r[k] <= v); return b; },
      gt(k, v) { st.filters.push(r => r[k] > v); return b; }, lt(k, v) { st.filters.push(r => r[k] < v); return b; },
      is(k, v) { st.filters.push(r => (r[k] ?? null) === v); return b; }, not() { return b; }, or() { return b; }, ilike() { return b; }, like() { return b; }, match() { return b; },
      order(c, o) { st.orders.push([c, !(o && o.ascending === false)]); return b; }, range(a, z) { st.range = [a, z]; return b; }, limit(n) { st.limit = n; return b; },
      single() { st.single = true; return b; }, maybeSingle() { st.maybe = true; return b; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); }
    };
    return b;
  }
  const NOW = Date.now();
  const LOGS = [
    ['2026-11-14T09:52:00+09:00', '데모 관리자', '엑셀(CSV) 내려받기', null, null, '13명'],
    ['2026-11-14T09:40:00+09:00', '항공운항과 학과장', '면접평가표 인쇄', 'ITC-2027-001', '아마노 유키', ''],
    ['2026-11-13T16:12:00+09:00', '국제교류팀 직원', '면접평가표 인쇄', 'ITC-2027-005', '응우옌 탄', ''],
    ['2026-11-13T14:02:00+09:00', '항공운항과 학과장', '학점인정 서류 인쇄', 'ITC-2027-001', '아마노 유키', '검토의견서·사정표'],
    ['2026-11-12T17:44:00+09:00', '국제교류팀 직원', '문서 발급·인쇄', 'ITC-2027-006', '바야르 소롱고', '합격통지서']
  ].map(r => ({ at: r[0], user_name: r[1], action: r[2], receipt_no: r[3], name_ko: r[4], detail: r[5] }));
  const RPC = {
    get_access_logs: () => LOGS, purge_preview: () => [{ term_id: 1, label: '2027학년도 1학기', year: 2027, n: 13 }], purge_history: () => [
      { purged_at: '2026-11-14T20:31:00+09:00', term_label: '여권번호·여권만료일·외국인등록번호 전체 삭제 (수집 중단)', n_applicants: 13, keep_years: 0, purged_by_name: '데모 관리자' },
      { purged_at: '2026-11-14T20:20:00+09:00', term_label: '입학지원서·성적증명서 파일 전체 삭제 (업로드 기능 폐지)', n_applicants: 9, keep_years: 0, purged_by_name: '데모 관리자' }],
    issue_document: () => [{ doc_no: 'ITC-B-0001', reissue_no: 0 }], auto_assign_scholarships: () => 0
  };
  let session = null;
  const user = { id: 'u-admin', email: 'demo@example.com' };
  window.__demo = { DB, setUser(id) { user.id = id; } };
  window.supabase = {
    createClient: () => ({
      from: Q,
      rpc: async (n, a) => ({ data: RPC[n] ? RPC[n](a) : null, error: null }),
      storage: { from: bucket => ({
        createSignedUrls: async paths => ({ data: paths.map(p => ({ path: p, signedUrl: avatar(Number(p.replace(/\D/g, '')), FEMALE.has(p.replace('.jpg', ''))) })), error: null }),
        createSignedUrl: async () => ({ data: { signedUrl: bucket === 'seal' ? SEAL : '' }, error: null }),
        upload: async () => ({ data: {}, error: null }), remove: async () => ({ data: [], error: null }), list: async () => ({ data: [], error: null }) }) },
      functions: { invoke: async (n, o) => {
        if (n === 'staff-login') {
          const acc = { '9001': 'u-admin', '9002': 'u-dept' }[String(o.body.emp_no || '')];
          if (!acc || o.body.password !== 'itc-demo-2026') {
            const err = new Error('Edge Function returned a non-2xx status code');
            err.context = new Response(JSON.stringify({ error: '직번 또는 비밀번호가 올바르지 않습니다. (체험 계정: 9001 또는 9002)' }), { status: 401 });
            return { data: null, error: err };
          }
          user.id = acc; user.email = acc === 'u-admin' ? 'evaluator-admin@example.com' : 'evaluator-dept@example.com';
          return { data: { access_token: 'demo', refresh_token: 'demo' }, error: null };
        }
        if (n === 'pii-crypt') { // 체험판: 가상 데이터라 암호화 없이 그대로 돌려줌
          const b = o.body || {};
          if (b.action === 'encrypt') return { data: { items: (b.items || []).map(x => ({ ...x })) }, error: null };
          if (b.action === 'decrypt') return { data: { rows: [] }, error: null };
          return { data: { total: DB.applicants.length, plain_applicants: 0, plain_mail_logs: 0, encrypted_now: { applicants: 0, mail_logs: 0 } }, error: null };
        }
        await new Promise(r => setTimeout(r, 450)); return { data: { results: (o.body.applicant_ids || []).map(id => ({ id, ok: true, to: (DB.applicants.find(a => a.id === id) || {}).email })) }, error: null };
      } },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
      auth: {
        getSession: async () => ({ data: { session } }),
        getUser: async () => ({ data: { user: session ? user : null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        setSession: async () => { session = { user }; return { data: { user, session }, error: null }; },
        signInWithPassword: async () => { session = { user }; return { data: { user, session }, error: null }; },
        signOut: async () => { session = null; return {}; }
      }
    })
  };
})();
