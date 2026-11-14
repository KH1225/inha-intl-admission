'use strict';
/* ===== 공통: 연결, 상태, 로그인, 화면 뼈대 ===== */
const C = window.CONFIG;
const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

const STATUSES = ['서류심사', '보완요청', '면접심사', '최종합격', '불합격', '등록완료', '접수취소'];
const STATUS_CLS = { 서류심사: 's-review', 보완요청: 's-fix', 면접심사: 's-intv', 최종합격: 's-pass', 불합격: 's-fail', 등록완료: 's-reg', 접수취소: 's-cancel' };
const ROLE_LABEL = { admin: '국제교류원 총괄관리자', staff: '국제교류팀', viewer: '조회 전용', director: '국제교류원장', dept: '학과장' };

const S = {
  user: null, profile: null, role: null,
  terms: [], term: null, depts: [], deptMap: {}, quals: [], qualMap: {}, agencies: [], agencyMap: {},
  partners: [], partnerMap: {}, docTypes: [], rules: [], topik: [],
  apps: [], docs: {}, interviews: {}, evals: {}, payments: {},
  tab: 'dash',
  f: { q: '', status: '', kind: '', qual: '', nat: '', dept: '', schol: '', sortKey: 'receipt_no', sortDir: 1, page: 1, passIds: null },
  evalDraft: {}, evalFilter: { dept: '', pending: false }
};

const can = {
  broad: () => ['admin', 'staff', 'viewer'].includes(S.role),
  edit: () => ['admin', 'staff'].includes(S.role),
  admin: () => S.role === 'admin'
};

/* ---------- 작은 도구들 ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const p2 = n => String(n).padStart(2, '0');
const num = n => (n == null || n === '' ? '-' : Number(n).toLocaleString('ko-KR'));
const won = n => (n == null || n === '' ? '-' : Number(n).toLocaleString('ko-KR') + '원');
function fmtDate(v) {
  if (!v) return '-';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return isNaN(d) ? esc(v) : `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
function fmtDateTime(v) {
  if (!v) return '-';
  const d = new Date(v);
  return isNaN(d) ? esc(v) : `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
function toLocalInput(v) {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d) ? '' : `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
function todayYMD() { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; }
function errMsg(e) {
  const m = (e && (e.message || e.details || e.error_description)) || String(e);
  if (/duplicate key|23505/.test(m)) {
    if (/receipt_no/.test(m)) return '접수번호가 중복됩니다.';
    return '이미 같은 값이 등록되어 있습니다.';
  }
  if (/row-level security|permission denied/i.test(m)) return '이 작업을 할 권한이 없습니다.';
  // 새 기능용 DB 설정(SQL)을 아직 실행하지 않았을 때
  const sqlHint = [
    [/applicants_route_check|enum .*route/i, '지원경로', '2026-11-12_지원경로_국내고교졸업.sql'],
    [/applicants_status_check|enum .*status/i, '접수취소 상태', '2026-11-10_접수취소_상태추가.sql'],
    [/document_types_admission_kind/i, '전공심화 서류 구분', '2026-11-11_전공심화_제출서류.sql']
  ].find(([re]) => re.test(m));
  if (sqlHint) return `DB에 새 ${sqlHint[1]} 설정이 아직 없습니다. 총괄관리자가 Supabase SQL Editor에서 sql/${sqlHint[2]} 를 실행해야 합니다.`;
  return m;
}
function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toast').appendChild(el);
  setTimeout(() => el.remove(), type === 'err' ? 8000 : 3500);
}
function setBusy(on) { document.body.classList.toggle('busy', !!on); }
function chunk(arr, n) { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; }

/* ---------- 모달 ---------- */
const modalStack = [];
function openModal(html, opts = {}) {
  const bd = document.createElement('div');
  bd.className = 'backdrop';
  bd.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  bd.addEventListener('mousedown', e => { if (e.target === bd && !opts.sticky) closeModal(bd); });
  document.body.appendChild(bd);
  modalStack.push(bd);
  return bd;
}
function closeModal(el) {
  const bd = el || modalStack[modalStack.length - 1];
  if (!bd) return;
  bd.remove();
  const i = modalStack.indexOf(bd);
  if (i >= 0) modalStack.splice(i, 1);
}
function mHead(title, sub) {
  return `<div class="m-head"><div><h2>${title}</h2>${sub ? `<div class="muted small">${sub}</div>` : ''}</div>
  <button class="x" type="button" onclick="closeModal(this.closest('.backdrop'))" aria-label="닫기">✕</button></div>`;
}
const field = (label, input, o = {}) => `<label class="fld ${o.req ? 'req' : ''} ${o.full ? 'full' : ''}"><span>${label}</span>${input}</label>`;

/* ---------- 데이터 읽기 ---------- */
async function fetchAll(make) {
  const size = 1000; let from = 0, out = [];
  for (;;) {
    const { data, error } = await make().range(from, from + size - 1);
    if (error) throw error;
    out = out.concat(data || []);
    if (!data || data.length < size) break;
    from += size;
  }
  return out;
}
async function selectAll(table, orderCols) {
  return fetchAll(() => { let b = sb.from(table).select('*'); for (const c of orderCols) b = b.order(c); return b; });
}

async function loadStatic() {
  const [terms, depts, quals, agencies, partners, docTypes, rules, topik] = await Promise.all([
    selectAll('terms', ['year', 'id']), selectAll('departments', ['sort_order']), selectAll('qualifications', ['code']),
    selectAll('agencies', ['name']), selectAll('partner_schools', ['name']), selectAll('document_types', ['sort_order']),
    selectAll('scholarship_rules', ['rank_no']), selectAll('topik_rates', ['level'])
  ]);
  S.terms = terms; S.depts = depts; S.quals = quals; S.agencies = agencies; S.partners = partners;
  S.docTypes = docTypes; S.rules = rules; S.topik = topik;
  rebuildMaps();
}
function rebuildMaps() {
  S.deptMap = Object.fromEntries(S.depts.map(d => [d.id, d]));
  S.qualMap = Object.fromEntries(S.quals.map(q => [q.code, q]));
  S.agencyMap = Object.fromEntries(S.agencies.map(a => [a.id, a]));
  S.partnerMap = Object.fromEntries(S.partners.map(p => [p.id, p]));
}
const deptName = id => (S.deptMap[id] ? S.deptMap[id].name_ko : '-');
const qualName = code => (S.qualMap[code] ? S.qualMap[code].name_ko : '-');

/* 편입학 모집 학과 (학과명 기준) */
const TRANSFER_DEPTS = ['항공운항과', '항공경영학과'];
const isTransferDept = d => !!d && TRANSFER_DEPTS.includes(String(d.name_ko || '').replace(/\s/g, ''));
const ROUTE_PARTNER = '협약학교 추천'; // DB에 저장되는 값 (바꾸지 말 것)
const ROUTE_PARTNER_LABEL = '협약학교'; // 화면 표시 이름
const ROUTE_ALUMNI = '우리대학 졸업';
const ROUTE_DOMHS = '국내 고교 졸업';
const ROUTES = ['개별지원', '유학원', ROUTE_PARTNER, ROUTE_ALUMNI, ROUTE_DOMHS];
/* 지원경로 표시: 개별지원 / 유학원(이름) / 협약학교(학교명) / 우리대학 졸업 */
function routeLabel(a) {
  if (a.route === '유학원') return `유학원${a.agency_id && S.agencyMap[a.agency_id] ? ` (${S.agencyMap[a.agency_id].name})` : ''}`;
  if (a.route === ROUTE_PARTNER) return `${ROUTE_PARTNER_LABEL}${a.partner_school_id && S.partnerMap[a.partner_school_id] ? ` (${S.partnerMap[a.partner_school_id].name})` : ''}`;
  return a.route || '개별지원';
}
const APP_COLS = 'id,term_id,receipt_no,name_ko,name_en,gender,birth_date,nationality,admission_kind,transfer_year,department_id,qualification_code,route,agency_id,topik_level,visa_type,email,phone,high_school,gpa,dorm_application,status,scholarship_type,scholarship_pct,scholarship_amount,scholarship_source,partner_school_id,memo,photo_path,created_at,updated_at';

const OPT_COLS = ['domestic_hs', 'cc_emails', 'dorm_room', 'prev_university'];
/* 쉼표·공백·세미콜론으로 구분된 이메일 목록 */
const splitEmails = s => String(s || '').split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
const emailValid = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
async function loadTermData() {
  if (!S.term) { S.apps = []; return; }
  if (can.broad()) {
    // 나중에 추가된 칸(국내 고교 출신, 추가 이메일)은 SQL 적용 전에는 없을 수 있어, 없는 칸은 빼고 다시 불러옵니다
    let opt = OPT_COLS.slice();
    for (;;) {
      try {
        S.apps = await fetchAll(() => sb.from('applicants').select([APP_COLS, ...opt].join(',')).eq('term_id', S.term.id).order('id'));
        break;
      } catch (e) {
        const miss = opt.find(c => errMsg(e).includes(c));
        if (!miss) throw e;
        opt = opt.filter(c => c !== miss);
      }
    }
    S.hasCol = Object.fromEntries(OPT_COLS.map(c => [c, opt.includes(c)]));
    S.noDomHs = !S.hasCol.domestic_hs;
  } else {
    S.apps = await fetchAll(() => sb.from('interview_targets').select('*').eq('term_id', S.term.id).order('id'));
  }
  await loadAux();
}
async function loadAux() {
  const ids = new Set(S.apps.map(a => a.id));
  const stByApp = Object.fromEntries(S.apps.map(a => [a.id, a.status]));
  const ivs = await selectAll('interviews', ['applicant_id']);
  S.interviews = {};
  // 면접심사 단계이거나 면접을 거쳐 결과가 난 지원자만 면접 대상으로 봅니다 (서류심사·보완요청으로 되돌린 지원자는 제외)
  ivs.forEach(r => { if (ids.has(r.applicant_id) && ['면접심사', '최종합격', '불합격', '등록완료'].includes(stByApp[r.applicant_id])) S.interviews[r.applicant_id] = r; });
  const evs = await selectAll('interview_evaluations', ['applicant_id', 'evaluator_type']);
  S.evals = {};
  evs.forEach(r => { if (ids.has(r.applicant_id)) S.evals[r.applicant_id + '|' + r.evaluator_type] = r; });
  S.payments = {}; S.docs = {};
  await loadPhotos();
  if (typeof loadCredit === 'function') await loadCredit();
  if (can.broad()) {
    const pays = await selectAll('payments', ['applicant_id']);
    pays.forEach(r => { if (ids.has(r.applicant_id)) S.payments[r.applicant_id] = r; });
    for (const part of chunk(Array.from(ids), 100)) {
      const rows = await fetchAll(() => sb.from('applicant_documents').select('applicant_id,doc_code,received,received_at,note').in('applicant_id', part).order('applicant_id').order('doc_code'));
      rows.forEach(r => { (S.docs[r.applicant_id] = S.docs[r.applicant_id] || {})[r.doc_code] = r; });
    }
  }
}
/* ---------- 지원자 사진 ---------- */
async function loadPhotos() {
  S.photos = {};
  const paths = S.apps.map(a => a.photo_path).filter(Boolean);
  for (const part of chunk(paths, 100)) {
    try {
      const { data } = await sb.storage.from('photos').createSignedUrls(part, 3600);
      (data || []).forEach(r => { if (r.signedUrl) S.photos[r.path] = r.signedUrl; });
    } catch (e) { /* 사진을 못 불러와도 화면은 계속 보여 줍니다 */ }
  }
}
const photoUrl = a => (a && a.photo_path && S.photos && S.photos[a.photo_path]) || '';
function avatarHtml(a, cls) {
  const u = photoUrl(a);
  return u ? `<img class="${cls || 'av'} ph" src="${esc(u)}" alt="" loading="lazy">` : `<div class="${cls || 'av'}">${esc((a.name_ko || '?').charAt(0))}</div>`;
}
/* 사진을 가로 480 x 세로 640 이내 JPG로 줄입니다 (용량 약 50~100KB) */
function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) { reject(new Error('이미지 파일(JPG, PNG)만 올릴 수 있습니다.')); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 480 / img.width, 640 / img.height);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('사진을 변환하지 못했습니다.'))), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('사진을 읽을 수 없습니다. 다른 파일로 시도해 주세요.')); };
    img.src = url;
  });
}
async function savePhoto(id, blob) {
  const path = id + '.jpg';
  const up = await sb.storage.from('photos').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  if (up.error) throw up.error;
  const r = await sb.from('applicants').update({ photo_path: path }).eq('id', id);
  if (r.error) throw r.error;
}
async function removePhoto(id) {
  await sb.storage.from('photos').remove([id + '.jpg']);
  const r = await sb.from('applicants').update({ photo_path: null }).eq('id', id);
  if (r.error) throw r.error;
}

/* ---------- 장학금 자동 배정 ----------
   지원자 등록·수정·상태 변경 때마다 자동으로 다시 계산합니다.
   (직접 지정한 지원자, 불합격·등록완료자는 DB 함수가 제외하고, 접수취소자는 여기서 비웁니다) */
async function syncScholarships() {
  if (!can.edit() || !S.term) return { changed: 0 };
  const r = await sb.rpc('auto_assign_scholarships', { p_term: S.term.id });
  if (r.error) { toast('장학금 자동 배정 실패: ' + errMsg(r.error), 'err'); return { error: r.error }; }
  // 접수취소자가 있을 때만, 그 지원자들의 자동 배정 장학금을 비웁니다 (직접 지정한 장학금은 그대로)
  const cancelled = S.apps.filter(a => a.status === '접수취소').map(a => a.id);
  for (const part of chunk(cancelled, 100)) {
    const c = await sb.from('applicants').update({ scholarship_type: null, scholarship_pct: 0 })
      .in('id', part).not('scholarship_type', 'is', null)
      .or('scholarship_source.is.null,scholarship_source.neq.수동');
    if (c.error) { console.warn('접수취소자 장학금 해제 실패', c.error); toast('접수취소자 장학금 해제 실패: ' + errMsg(c.error), 'err'); break; }
  }
  return { changed: r.data || 0 };
}
async function reloadAndRender() {
  const y = window.scrollY;
  setBusy(true);
  try { await loadTermData(); renderShell(); } catch (e) { toast(errMsg(e), 'err'); }
  setBusy(false);
  window.scrollTo(0, y);
}

/* ---------- 로그인 / 시작 ---------- */
function renderLogin(msg) {
  $('#app').innerHTML = `<div class="login-wrap"><form class="login" onsubmit="doLogin(event);return false">
    <img src="${esc(C.LOGO)}" class="login-logo" alt="" onerror="this.style.display='none'">
    <h1>${esc(C.SCHOOL_KO)}</h1><p>외국인 특별전형 현황판</p>
    <label>직번 또는 이메일<input id="lg-email" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" required></label>
    <label>비밀번호<input id="lg-pw" type="password" autocomplete="current-password" required></label>
    <div class="err" id="lg-err">${esc(msg || '')}</div>
    <button class="btn pri block" id="lg-btn" type="submit">로그인</button>
    <p class="hint">승인된 직원만 접속할 수 있습니다. 계정은 총괄관리자가 등록합니다.</p>
  </form></div>`;
}
async function doLogin(e) {
  e.preventDefault();
  const btn = $('#lg-btn'); btn.disabled = true;
  const fail = m => { $('#lg-err').textContent = m; btn.disabled = false; };
  let id = $('#lg-email').value.trim();
  // '@'가 없으면 직번으로 보고, 등록된 로그인 이메일을 찾아 로그인합니다
  if (!id.includes('@')) {
    const r = await sb.rpc('login_email', { p_emp_no: id });
    if (r.error) return fail(/login_email|function/i.test(r.error.message) ? '직번 로그인이 아직 설정되지 않았습니다. 이메일로 로그인하세요.' : r.error.message);
    if (!r.data) return fail('직번(이메일) 또는 비밀번호가 올바르지 않습니다.');
    id = r.data;
  }
  const { data, error } = await sb.auth.signInWithPassword({ email: id, password: $('#lg-pw').value });
  if (error) return fail(/Invalid login/i.test(error.message) ? '직번(이메일) 또는 비밀번호가 올바르지 않습니다.' : error.message);
  S.user = data.user;
  try { await afterLogin(); } catch (err) { renderFatal(err); }
}
function renderFatal(e) {
  $('#app').innerHTML = `<div class="center-msg"><div><h2>화면을 불러오지 못했습니다</h2>
  <p>${esc(errMsg(e))}</p><p class="small">SQL 3개(setup, scholarship, interview)와 보완 SQL(patch)을 모두 실행했는지 확인해 주세요.</p>
  <button class="btn pri" onclick="location.reload()">다시 시도</button> <button class="btn" onclick="logout()">로그아웃</button></div></div>`;
}
function renderNoAccess() {
  $('#app').innerHTML = `<div class="center-msg"><div><h2>접근 권한이 없습니다</h2>
  <p>로그인은 되었지만 이 시스템의 사용 권한이 등록되지 않았거나 중지된 계정입니다.<br>총괄관리자에게 권한 등록을 요청해 주세요.</p>
  <button class="btn" onclick="logout()">로그아웃</button></div></div>`;
}
async function afterLogin() {
  $('#app').innerHTML = '<div class="center-msg"><div>불러오는 중입니다…</div></div>';
  const { data: prof, error } = await sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle();
  if (error) throw error;
  if (!prof || !prof.active) { renderNoAccess(); return; }
  S.profile = prof; S.role = prof.role;
  await loadStatic();
  S.term = S.terms.find(t => t.is_current) || S.terms[S.terms.length - 1] || null;
  await loadTermData();
  S.tab = 'dash';
  renderShell();
  startIdleTimer();
}
async function logout() { try { await sb.auth.signOut(); } catch (e) { /* 무시 */ } location.reload(); }

let idleTimer = null;
function startIdleTimer() {
  const reset = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(async () => { await logout(); }, C.IDLE_MINUTES * 60 * 1000);
  };
  ['click', 'keydown', 'mousemove', 'touchstart'].forEach(ev => window.addEventListener(ev, reset, { passive: true }));
  reset();
}

/* ---------- 화면 뼈대 ---------- */
function scopeLabel() {
  if (S.role === 'dept') return deptName(S.profile.department_id);
  return '전체 학과';
}
function interviewProgress() {
  const ids = Object.keys(S.interviews);
  const sent = ids.filter(id => S.evals[id + '|학과장'] && S.evals[id + '|학과장'].submitted).length;
  return { total: ids.length, sent, pct: ids.length ? Math.round(sent / ids.length * 100) : 0 };
}
function toolbarHtml() {
  const t = S.term;
  const pg = interviewProgress();
  const b = [];
  b.push(`<select class="term-sel" onchange="changeTerm(this.value)" title="모집학기">${S.terms.map(x => `<option value="${x.id}" ${t && x.id === t.id ? 'selected' : ''}>${esc(x.year)}학년도 ${esc(x.semester)}</option>`).join('')}</select>`);
  if (can.admin()) {
    b.push(`<button class="btn out blue" onclick="openTuitionSettings()">등록금 &amp; 등록기간 설정</button>`);
    b.push(`<button class="btn out pur" onclick="openScholarship()">장학금 관리</button>`);
    b.push(`<button class="btn out blue" onclick="openDocSettings()">제출서류 설정</button>`);
    if (S.role === 'admin') b.push(`<button class="btn out" onclick="openSampleModal()">샘플 데이터</button>`);
  }
  b.push(`<button class="btn out blue" onclick="openProgress()">면접전형표 전송현황 <b>${pg.sent}/${pg.total} (${pg.pct}%)</b></button>`);
  if (can.admin()) b.push(`<button class="btn" onclick="exportCsv()">엑셀(CSV)</button>`);
  b.push('<span class="sp"></span>');
  if (can.edit()) {
    b.push(`<button class="btn pri" onclick="openApplicantForm()">＋ 학생 추가</button>`);
    b.push(`<button class="btn ok" onclick="openImport()">엑셀 일괄 등록</button>`);
  }
  if (can.admin()) {
    b.push(`<button class="btn" onclick="openNewTerm()">새 학기</button>`);
    b.push(`<button class="btn" onclick="openAccounts()">계정 관리</button>`);
    if (S.role === 'admin') b.push(`<button class="btn" onclick="openAccessLog()">열람 기록</button><button class="btn" onclick="openPurge()">개인정보 파기</button>`);
  }
  b.push(`<div class="who"><span class="dot"></span>[${esc(ROLE_LABEL[S.role])}] <span class="muted">(${esc(scopeLabel())})</span><button onclick="logout()">로그아웃</button></div>`);
  return b.join('');
}
function renderShell() {
  const t = S.term;
  $('#app').innerHTML = `
  <header class="top"><img src="${esc(C.LOGO)}" alt="" onerror="this.style.display='none'">
    <div><h1>${esc(C.SCHOOL_KO)} 외국인 특별전형 현황판 ${t ? `<span class="term-pill">${esc(t.name)}</span>` : ''}</h1>
    <div class="sub">${esc(C.SCHOOL_EN.toUpperCase())} (Est. 1958) · Global Admissions Management Portal</div></div></header>
  <div class="toolbar">${toolbarHtml()}</div>
  <nav class="tabs"><button class="${S.tab === 'dash' ? 'on' : ''}" onclick="switchTab('dash')">지원 현황</button>
    <button class="${S.tab === 'eval' ? 'on' : ''}" onclick="switchTab('eval')">면접 평가</button>
    ${typeof canSeeCredit === 'function' && canSeeCredit() ? `<button class="${S.tab === 'credit' ? 'on' : ''}" onclick="switchTab('credit')">학점 인정 심사</button>` : ''}</nav>
  <main id="main"></main>`;
  renderMain();
}
function renderMain() {
  if (!S.term) { $('#main').innerHTML = '<div class="center-msg"><div><h2>등록된 모집학기가 없습니다</h2><p>총괄관리자가 “새 학기”를 먼저 만들어 주세요.</p></div></div>'; return; }
  if (S.tab === 'eval') renderEval(); else if (S.tab === 'credit' && typeof renderCredit === 'function') renderCredit(); else renderDash();
}
function switchTab(t) { S.tab = t; renderShell(); }
async function changeTerm(id) {
  S.term = S.terms.find(t => String(t.id) === String(id)) || S.term;
  S.f.page = 1; S.f.passIds = null; S.evalDraft = {};
  await reloadAndRender();
}

