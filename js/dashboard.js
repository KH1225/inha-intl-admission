'use strict';
/* ===== 현황판: 카드, 차트, 지원자 목록 ===== */
const COLORS = ['#2563eb', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];
const TOPIK_COLOR = { 6: '#059669', 5: '#2563eb', 4: '#2563eb', 3: '#ea580c', 2: '#ea580c', 1: '#8b5cf6' };
const PAGE_SIZE = 100;

const cnt = st => S.apps.filter(a => a.status === st).length;
/* 접수취소된 지원자는 통계·차트·기본 목록에서 뺍니다 */
const activeApps = () => S.apps.filter(a => a.status !== '접수취소');
const hasFull = a => 'route' in a;

function requiredDocCodes(a) {
  return S.docTypes.filter(d => docRequired(d, a)).map(d => d.code);
}
function docProgress(a) {
  const req = requiredDocCodes(a);
  const got = req.filter(c => S.docs[a.id] && S.docs[a.id][c] && S.docs[a.id][c].received).length;
  return { need: req.length, got };
}
function orderOf(a) {
  const iv = S.interviews[a.id];
  const v = iv && iv.order_no != null ? iv.order_no : a.order_no;
  return v == null ? null : v;
}

function renderDash() {
  const total = activeApps().length;
  const kindN = k => activeApps().filter(a => a.admission_kind === k).length;
  const passed = cnt('최종합격'), reg = cnt('등록완료');
  const regRate = passed + reg ? (reg / (passed + reg) * 100).toFixed(1) : '0.0';
  const cards = [
    { st: '', l: '총 지원자 수', n: total, s: `<b>신입학 ${kindN('신입학')}명</b> · <b>편입학 ${kindN('편입학')}명</b>`, c: '#2563eb' },
    { st: '서류심사', l: '서류 심사중', n: cnt('서류심사'), s: '입학자격 및 아포스티유 확인', c: '#0ea5e9' },
    { st: '보완요청', l: '서류 보완요청', n: cnt('보완요청'), s: '잔고증명 / 성적표 등 미비', c: '#ea580c' },
    { st: '면접심사', l: '면접 대상자', n: cnt('면접심사'), s: '구술면접 및 화상 심사', c: '#7c3aed' },
    { st: '최종합격', l: '최종 합격자', n: passed, s: '합격통지서·등록금고지서 발급 대상', c: '#059669' },
    { st: '등록완료', l: '등록 완료자', n: reg, s: `등록률 ${regRate}% (합격자 대비)`, c: '#0d9488' },
    { st: '접수취소', l: '접수 취소', n: cnt('접수취소'), s: '지원 철회 · 통계에서 제외', c: '#6b7280' }
  ].map(c => `<button class="stat ${S.f.status === c.st && (c.st || !S.f.status) ? 'on' : ''}" style="--c:${c.c}" onclick="cardFilter('${c.st}')">
      <div class="l"><i></i>${c.l}</div><div class="n">${c.n}</div><div class="s">${c.s}</div></button>`).join('');

  $('#main').innerHTML = `
    <section class="cards">${cards}</section>
    <section class="panels">${chartsHtml()}</section>
    <section class="panel" id="listPanel">
      ${filtersHtml()}
      <div class="notice">[${esc(ROLE_LABEL[S.role])}${S.role === 'dept' ? ' · ' + esc(scopeLabel()) : ' (전체 학과)'}] 권한으로 로그인되었습니다. ${roleNotice()}</div>
      <div class="list-head"><div id="resultCount" class="muted"></div><div style="display:flex;gap:8px;flex-wrap:wrap">${listButtons()}</div></div>
      <div class="tbl-wrap"><table class="tbl"><thead id="thead"></thead><tbody id="tbody"></tbody></table></div>
      <div class="more" id="more"></div>
    </section>`;
  renderTable();
}
function roleNotice() {
  switch (S.role) {
    case 'admin': return '전체 지원자 열람, 심사진행상태 수정, 면접 순서 지정 등 모든 관리 권한이 활성화되었습니다.';
    case 'staff': return '지원자 입력·수정, 서류 확인, 문서 발급이 가능합니다. 합격·불합격 결정과 면접 순서 지정은 총괄관리자가 합니다.';
    case 'viewer': return '조회만 가능합니다.';
    case 'director': return '전 학과의 지원 현황을 조회하고 면접평가표를 작성할 수 있습니다.';
    default: return '소속 학과 지원자만 조회하고 면접평가표를 작성할 수 있습니다.';
  }
}
function listButtons() {
  const b = [];
  b.push(`<button class="btn pur" onclick="switchTab('eval')">면접평가표 (전체 평가)</button>`);
  if (can.admin()) b.push(`<button class="btn blue" onclick="openOrderModal()">면접 순서 지정</button>`);
  if (can.edit()) b.push(`<button class="btn blue" onclick="openMailModal()">안내 메일 발송</button>`);
  if (S.role === 'admin' || S.role === 'staff' || S.role === 'director') b.push(`<button class="btn" onclick="switchTab('eval');openEvalPrint()">면접평가표 인쇄</button>`);
  if (can.edit()) b.push(`<button class="btn" onclick="openAppFileBulk()">입학지원서 일괄 올리기</button>`);
  return b.join('');
}

/* ---------- 차트 ---------- */
function chartsHtml() {
  const apps = activeApps(), total = apps.length;
  // 국가 색: 전체 지원자 기준 상위 6개국에 고정 색, 나머지는 회색(기타) — 두 그래프에서 같은 색을 씁니다
  const natAll = {};
  apps.forEach(a => { natAll[a.nationality || '미상'] = (natAll[a.nationality || '미상'] || 0) + 1; });
  const natRank = Object.entries(natAll).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko')).map(([k]) => k);
  const OTHER = COLORS[6];
  const natColor = k => { const r = natRank.indexOf(k); return r >= 0 && r < 6 ? COLORS[r] : OTHER; };
  // 국적 원그래프 (학과 선택 가능)
  const deptIds = [...new Set(apps.map(a => a.department_id))];
  if (S.dashDept && !deptIds.some(id => String(id) === String(S.dashDept))) S.dashDept = '';
  const sub = S.dashDept ? apps.filter(a => String(a.department_id) === String(S.dashDept)) : apps;
  const subTotal = sub.length;
  const nat = {};
  sub.forEach(a => { nat[a.nationality || '미상'] = (nat[a.nationality || '미상'] || 0) + 1; });
  let items = Object.entries(nat).map(([k, n]) => ({ k, n, c: natColor(k) })).sort((a, b) => b.n - a.n || natRank.indexOf(a.k) - natRank.indexOf(b.k));
  if (items.length > 7 || items.some(x => x.c === OTHER)) {
    const keep = items.filter(x => x.c !== OTHER).slice(0, 6), rest = items.filter(x => !keep.includes(x));
    items = keep.concat(rest.length ? [{ k: '기타', n: rest.reduce((t, x) => t + x.n, 0), c: OTHER, list: rest.map(x => `${x.k} ${x.n}`).join(', ') }] : []);
  }
  const R = 54, CIRC = 2 * Math.PI * R; let off = 0;
  const segs = items.map(it => {
    const len = subTotal ? it.n / subTotal * CIRC : 0;
    const s = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${it.c}" stroke-width="22" stroke-dasharray="${len} ${CIRC - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"><title>${esc(it.k)} ${it.n}명</title></circle>`;
    off += len; return s;
  }).join('');
  const donut = `<svg viewBox="0 0 140 140" class="donut"><circle r="${R}" cx="70" cy="70" fill="none" stroke="var(--line)" stroke-width="22"/>${segs}
    <text x="70" y="70" text-anchor="middle" class="dn">${subTotal}</text><text x="70" y="86" text-anchor="middle" class="dl">${S.dashDept ? '학과 지원자' : '총 지원자'}</text></svg>`;
  const legend = items.map(it => `<div ${it.list ? `title="${esc(it.list)}"` : ''}><span><i style="background:${it.c}"></i>${esc(it.k)}</span><b>${it.n}명 <span class="muted">(${subTotal ? Math.round(it.n / subTotal * 100) : 0}%)</span></b></div>`).join('');
  const deptSel = `<select class="dash-dept" onchange="S.dashDept=this.value;renderDash()"><option value="">전체 학과</option>${deptIds.map(id => ({ id, nm: deptName(id) })).sort((a, b) => a.nm.localeCompare(b.nm, 'ko'))
    .map(d => `<option value="${d.id}" ${String(S.dashDept) === String(d.id) ? 'selected' : ''}>${esc(d.nm)}</option>`).join('')}</select>`;
  // 학과별: 국가별로 나눈 막대 + 국가별 인원
  const dc = {};
  apps.forEach(a => { (dc[a.department_id] = dc[a.department_id] || []).push(a); });
  const top = Object.entries(dc).map(([id, list]) => ({ id, n: list.length, list })).sort((a, b) => b.n - a.n || deptName(Number(a.id)).localeCompare(deptName(Number(b.id)), 'ko'));
  const max = top.length ? top[0].n : 1;
  const bars = top.map((t, i) => {
    const cnt = {};
    t.list.forEach(a => { cnt[a.nationality || '미상'] = (cnt[a.nationality || '미상'] || 0) + 1; });
    const ns = Object.entries(cnt).sort((a, b) => b[1] - a[1] || natRank.indexOf(a[0]) - natRank.indexOf(b[0]));
    const segsB = ns.map(([k, n]) => `<b style="width:${n / max * 100}%;background:${natColor(k)}" title="${esc(k)} ${n}명"></b>`).join('');
    const on = String(S.dashDept) === String(t.id);
    return `<div class="bar dbar ${on ? 'on' : ''}" onclick="S.dashDept=${on ? "''" : `'${t.id}'`};renderDash()" title="눌러서 국적별 분포 보기">
      <div class="row"><span>${i + 1}&nbsp; ${esc(deptName(Number(t.id)))}</span><span>${t.n}명</span></div>
      <div class="tr stack">${segsB}</div>
      <div class="nat-line">${ns.map(([k, n]) => `<span><i style="background:${natColor(k)}"></i>${esc(k)} ${n}</span>`).join('')}</div></div>`;
  }).join('') || '<div class="muted">데이터가 없습니다</div>';
  // TOPIK
  const lv = {}; apps.forEach(a => { if (a.topik_level) lv[a.topik_level] = (lv[a.topik_level] || 0) + 1; });
  const tpRow = (tag, color, n) => `<div class="tp"><span class="tag" style="background:${color}">${tag}</span><div class="tr"><b style="width:${total ? n / total * 100 : 0}%;background:${color}"></b></div><span><b>${n}명</b> <span class="muted small">(${total ? Math.round(n / total * 100) : 0}%)</span></span></div>`;
  const tp = [6, 5, 4, 3, 2, 1].map(l => tpRow(`TOPIK ${l}급`, TOPIK_COLOR[l], lv[l] || 0)).join('')
    + tpRow('TOPIK 없음', '#94a3b8', apps.filter(a => !a.topik_level).length);
  return `
   <div class="panel"><h3>국적별 지원 분포 ${deptSel}</h3><div class="donut-wrap">${donut}<div class="legend">${legend || '<span class="muted">데이터가 없습니다</span>'}</div></div></div>
   <div class="panel"><h3>학과별 지원 현황 <small>국가별 인원 · 학과를 누르면 왼쪽에 국적 분포</small></h3><div class="bars scroll">${bars}</div></div>
   <div class="panel"><h3>한국어(TOPIK) 어학 현황 <small>급수별 보유 인원</small></h3>${tp}</div>`;
}

/* ---------- 필터 / 검색 ---------- */
function opt(v, label, cur) { return `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(label)}</option>`; }
function filtersHtml() {
  const f = S.f;
  const nats = Array.from(new Set(S.apps.map(a => a.nationality))).sort();
  const schols = Array.from(new Set(S.apps.map(a => a.scholarship_type).filter(Boolean))).sort();
  const deptIds = Array.from(new Set(S.apps.map(a => a.department_id)));
  return `<div class="filters"><input class="search" id="q" placeholder="지원자 성명, 영문명, 접수번호${can.broad() ? ', 여권번호' : ''} 검색..." value="${esc(f.q)}" oninput="onSearch(this.value)">
    <button class="btn sm" onclick="resetFilters()">필터 초기화</button></div>
   <div class="filters">
    <select onchange="setFilter('status',this.value)"><option value="">상태</option>${STATUSES.map(s => opt(s, s, f.status)).join('')}</select>
    <select onchange="setFilter('kind',this.value)"><option value="">입학구분</option>${['신입학', '편입학'].map(s => opt(s, s, f.kind)).join('')}</select>
    <select onchange="setFilter('qual',this.value)"><option value="">전형구분</option>${S.quals.map(q => opt(q.code, q.name_ko, f.qual)).join('')}</select>
    <select onchange="setFilter('nat',this.value)"><option value="">국적</option>${nats.map(n => opt(n, n, f.nat)).join('')}</select>
    <select onchange="setFilter('dept',this.value)"><option value="">지원학과 (전체 전공)</option>${deptIds.map(id => opt(id, deptName(id), f.dept)).join('')}</select>
    ${can.broad() ? `<select onchange="setFilter('schol',this.value)"><option value="">장학금</option><option value="__none__" ${f.schol === '__none__' ? 'selected' : ''}>장학금 없음</option>${schols.map(s => opt(s, s, f.schol)).join('')}</select>` : ''}
   </div>`;
}
function setFilter(k, v) { S.f[k] = v; S.f.page = 1; if (k === 'status') renderDash(); else renderTable(); }
function cardFilter(st) { S.f.status = st; S.f.page = 1; renderDash(); }
function resetFilters() {
  S.f = { q: '', status: '', kind: '', qual: '', nat: '', dept: '', schol: '', sortKey: 'receipt_no', sortDir: 1, page: 1, passIds: null };
  renderDash();
}
let searchTimer = null;
function onSearch(v) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    S.f.q = v; S.f.page = 1; S.f.passIds = null;
    const t = v.trim();
    if (can.broad() && /^[A-Za-z0-9]{6,}$/.test(t) && /\d/.test(t)) {
      try {
        const { data } = await sb.rpc('find_by_passport', { p: t });
        S.f.passIds = new Set((data || []).map(x => (typeof x === 'string' ? x : Object.values(x)[0])));
      } catch (e) { /* 여권번호 검색 실패는 무시 */ }
    }
    renderTable();
  }, 250);
}
function sortVal(a, k) {
  switch (k) {
    case 'dept': return deptName(a.department_id);
    case 'order': { const o = orderOf(a); return o == null ? 1e9 : o; }
    case 'status': return STATUSES.indexOf(a.status);
    case 'topik': return a.topik_level || 0;
    default: return a[k] == null ? '' : a[k];
  }
}
function sortBy(k) { if (S.f.sortKey === k) S.f.sortDir *= -1; else { S.f.sortKey = k; S.f.sortDir = 1; } renderTable(); }
function filteredApps() {
  const f = S.f, q = f.q.trim().toLowerCase();
  const list = S.apps.filter(a => {
    if (f.status && a.status !== f.status) return false;
    if (!f.status && a.status === '접수취소') return false;
    if (f.kind && a.admission_kind !== f.kind) return false;
    if (f.qual && a.qualification_code !== f.qual) return false;
    if (f.nat && a.nationality !== f.nat) return false;
    if (f.dept && String(a.department_id) !== String(f.dept)) return false;
    if (f.schol) { if (f.schol === '__none__') { if (a.scholarship_type) return false; } else if (a.scholarship_type !== f.schol) return false; }
    if (q) {
      const hit = (a.name_ko || '').toLowerCase().includes(q) || (a.name_en || '').toLowerCase().includes(q) ||
        (a.receipt_no || '').toLowerCase().includes(q) || (a.passport_last4 || '').toLowerCase() === q || (f.passIds && f.passIds.has(a.id));
      if (!hit) return false;
    }
    return true;
  });
  const k = f.sortKey, d = f.sortDir;
  list.sort((x, y) => { const a = sortVal(x, k), b = sortVal(y, k); return (a < b ? -1 : a > b ? 1 : 0) * d; });
  return list;
}

/* ---------- 표 ---------- */
function statusOptions(a) {
  const cur = a.status;
  if (can.admin()) return { opts: STATUSES, disabled: false };
  if (S.role === 'staff') {
    if (cur === '불합격' || cur === '등록완료' || cur === '접수취소') return { opts: [cur], disabled: true };
    if (cur === '최종합격') return { opts: ['최종합격', '등록완료'], disabled: false };
    return { opts: ['서류심사', '보완요청', '면접심사'], disabled: false };
  }
  return { opts: [cur], disabled: true };
}
function statusCell(a) {
  if (!can.edit()) return `<span class="pill ${STATUS_CLS[a.status]}">${esc(a.status)}</span>`;
  const so = statusOptions(a);
  return `<select class="st ${STATUS_CLS[a.status]}" ${so.disabled ? 'disabled' : ''} onchange="changeStatus('${a.id}',this)">${so.opts.map(s => opt(s, s, a.status)).join('')}</select>`;
}
function rowHtml(a) {
  const full = hasFull(a);
  const ag = a.route === '유학원' || a.route === ROUTE_PARTNER || a.route === ROUTE_ALUMNI ? `<span class="badge ag">${esc(routeLabel(a).replace(' (', '('))}</span>` : (full ? `<span class="badge ag">개별지원</span>` : '');
  const d = S.deptMap[a.department_id] || {};
  const dp = docProgress(a);
  const dots = Array.from({ length: dp.need }, (_, i) => `<i class="${i < dp.got ? '' : 'no'}"></i>`).join('');
  const ord = orderOf(a);
  return `<tr class="${a.status === '접수취소' ? 'cancelled' : ''}">
    <td><span class="rno">${esc(a.receipt_no)}</span></td>
    <td><div class="who-cell">${avatarHtml(a)}<div>
      <div class="nm">${esc(a.name_ko)} <span class="muted small">${a.gender === '여' ? '여' : '남'}</span>${ag}</div>
      <div class="muted small">${esc(a.name_en)}</div>
      ${a.visa_type ? `<div class="small" style="color:var(--pri2);font-weight:700">비자: ${esc(a.visa_type)}</div>` : ''}</div></div></td>
    <td style="white-space:nowrap">${esc(a.nationality)}</td>
    <td><div class="nm">${esc(d.name_ko || '-')} <span class="badge kind">${esc(a.admission_kind === '편입학' ? '편입학' : '신입학')}</span></div>
      <div class="muted small">${esc(d.division || '')} · ${esc(d.program_type || '')}</div></td>
    <td><span class="ord ${ord == null ? 'none' : ''}">${ord == null ? '미지정' : ord + '번'}</span></td>
    <td style="white-space:nowrap">${a.topik_level ? `<b>TOPIK ${a.topik_level}급</b>` : '<span class="muted">-</span>'}</td>
    ${can.broad() ? `<td>${dp.need ? `<div class="dots">${dots}</div><div class="dc ${dp.got >= dp.need ? 'ok' : 'no'}">${dp.got}/${dp.need} 구비${dp.got >= dp.need ? '' : ' 미비'}</div>` : '<span class="muted">-</span>'}</td>` : ''}
    <td>${statusCell(a)}</td>
    <td class="muted" style="white-space:nowrap">${fmtDate(a.created_at)}</td>
    <td><div class="acts">
      ${can.broad() ? `<button class="btn sm" onclick="openDetail('${a.id}','docs')">서류</button>` : ''}
      ${can.edit() ? `<button class="btn sm" onclick="openPrintMenu('${a.id}')">인쇄</button>` : ''}
      <button class="btn sm" onclick="openDetail('${a.id}')">상세</button></div></td></tr>`;
}
function renderTable() {
  const list = filteredApps();
  const th = (k, label) => `<th class="s" onclick="sortBy('${k}')">${label}${S.f.sortKey === k ? (S.f.sortDir > 0 ? ' ▲' : ' ▼') : ' ↕'}</th>`;
  $('#thead').innerHTML = `<tr>${th('receipt_no', '접수번호')}${th('name_ko', '지원자 성명')}${th('nationality', '국적')}${th('dept', '지원 학과 / 과정')}${th('order', '면접 순서')}${th('topik', '어학 능력')}${can.broad() ? '<th>서류 구비</th>' : ''}${th('status', '심사 진행상태')}${th('created_at', '지원일자')}<th class="right">관리</th></tr>`;
  const shown = list.slice(0, S.f.page * PAGE_SIZE);
  $('#tbody').innerHTML = shown.map(rowHtml).join('') || `<tr><td colspan="10" class="muted" style="text-align:center;padding:28px">조건에 맞는 지원자가 없습니다.</td></tr>`;
  const nc = cnt('접수취소');
  $('#resultCount').innerHTML = `조회 결과: <b>${list.length}</b>명 / 전체 <b>${activeApps().length}</b>명${nc ? ` <span class="small">(접수취소 ${nc}명 별도)</span>` : ''}`;
  $('#more').innerHTML = list.length > shown.length ? `<button class="btn" onclick="S.f.page++;renderTable()">더 보기 (${shown.length}/${list.length})</button>` : '';
}

/* ---------- 상태 변경 ---------- */
async function changeStatus(id, el) {
  const a = S.apps.find(x => x.id === id);
  const to = el.value, from = a.status;
  if (to === from) return;
  if (to === '접수취소') { el.value = from; cancelApplication(id); return; }
  if ((to === '최종합격' || to === '불합격') && !confirm(`${a.name_ko} 지원자를 '${to}' 처리합니다. 계속할까요?`)) { el.value = from; return; }
  el.disabled = true;
  const { error } = await sb.from('applicants').update({ status: to }).eq('id', id);
  if (error) { toast(errMsg(error), 'err'); el.value = from; el.disabled = false; return; }
  a.status = to;
  await syncScholarships();
  try { await loadTermData(); } catch (e) { toast(errMsg(e), 'err'); }
  const y = window.scrollY;
  renderShell();
  window.scrollTo(0, y);
  toast(`${a.name_ko}: ${to} 처리되었습니다.`);
}

/* ---------- CSV ---------- */
function exportCsv() {
  const list = filteredApps();
  const head = ['접수번호', '한글성명', '영문성명', '성별', '생년월일', '국적', '입학구분', '지원학과', '전형', '지원경로', 'TOPIK', '심사상태', '장학금', '장학금액', '지원일자'];
  const cell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? '"' + s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1") + '"' : s; };
  const rows = list.map(a => [a.receipt_no, a.name_ko, a.name_en, a.gender, a.birth_date, a.nationality, a.admission_kind, deptName(a.department_id), qualName(a.qualification_code), a.route, a.topik_level, a.status, a.scholarship_type, a.scholarship_amount, fmtDate(a.created_at)]);
  const csv = '﻿' + [head].concat(rows).map(r => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const l = document.createElement('a'); l.href = url; l.download = `지원자목록_${S.term.name}_${todayYMD()}.csv`; l.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(`${list.length}명을 내보냈습니다. 개인정보가 들어 있으니 안전하게 보관하세요.`);
}
