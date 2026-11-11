'use strict';
/* ===== 편입학 학점인정심사 (학교 양식: 「편입학 지원자 학점인정 심의」 사정표 + 「편입학 성적인정 검토 의견서」) =====
   학과장: 자기 학과 편입학 지원자 심의 → 서명 후 제출 (제출 후 수정 불가)
   총괄관리자·국제교류팀: 조회·수정, 제출 취소 / 국제교류원장: 조회
   표: credit_reviews(학생별 1건), credit_review_courses(사정표 과목) */

const CR_CATS = ['전공', '교양'];
/* 인정 한도: 2학년 편입 최대 36학점(교양 6), 3학년 편입 최대 72학점(교양 9) */
const CR_LIMIT = { 2: { total: 36, gen: 6 }, 3: { total: 72, gen: 9 } };
const canSeeCredit = () => ['admin', 'staff', 'director', 'dept'].includes(S.role);
const crOf = id => (S.credit || {})[id] || null;
const crCourses = id => (S.creditCourses || {})[id] || [];
/* 전적교: 직접 입력한 값이 없으면 지원자의 협약학교 이름 */
const crPartner = a => (a && a.partner_school_id && S.partnerMap && S.partnerMap[a.partner_school_id] ? S.partnerMap[a.partner_school_id].name : '');
const crSchool = a => ((crOf(a.id) || {}).prev_school || crPartner(a));
const crEditable = id => { const r = crOf(id); return (S.role === 'dept' && !(r && r.submitted)) || can.edit(); };
const semKo = t => (t && t.semester === '후기' ? '2학기' : '1학기');
const crTermTitle = () => `${esc(S.term.year)}학년도 ${semKo(S.term)}`;

async function loadCredit() {
  S.credit = {}; S.creditCourses = {}; S.creditReady = false;
  if (!canSeeCredit()) return;
  const ids = S.apps.filter(a => a.admission_kind === '편입학').map(a => a.id);
  try {
    if (!ids.length) { const t = await sb.from('credit_reviews').select('applicant_id').limit(1); S.creditReady = !t.error; return; }
    for (const part of chunk(ids, 100)) {
      const [r, c] = await Promise.all([
        sb.from('credit_reviews').select('*').in('applicant_id', part),
        sb.from('credit_review_courses').select('*').in('applicant_id', part).order('seq')
      ]);
      if (r.error || c.error) return; // SQL 적용 전
      (r.data || []).forEach(x => { S.credit[x.applicant_id] = x; });
      (c.data || []).forEach(x => { (S.creditCourses[x.applicant_id] = S.creditCourses[x.applicant_id] || []).push(x); });
    }
    S.creditReady = true;
  } catch (e) { /* 무시 */ }
}

function creditAll() { return S.apps.filter(a => a.admission_kind === '편입학' && a.status !== '접수취소'); }
function creditTargets() {
  return creditAll().filter(a => (!S.creditDept || String(a.department_id) === String(S.creditDept))
      && (!S.creditPending || !(crOf(a.id) && crOf(a.id).submitted)))
    .sort((x, y) => deptName(x.department_id).localeCompare(deptName(y.department_id), 'ko') || String(x.receipt_no).localeCompare(String(y.receipt_no)));
}
/* 인정 학점 계산: 체크한 과목 합계(r…) → 편입 학년별 최대 인정 기준 적용(전공 우선) */
function crSums(rows, a) {
  const ok = rows.filter(c => c.recognized);
  const sum = f => ok.filter(f).reduce((t, c) => t + (Number(c.credits) || 0), 0);
  const rMaj = sum(c => c.category === '전공'), rGen = sum(c => c.category === '교양'), rEtc = sum(c => !CR_CATS.includes(c.category));
  const rTotal = rMaj + rGen + rEtc;
  const L = a ? CR_LIMIT[Number(a.transfer_year)] : null;
  let maj = rMaj, gen = rGen, etc = rEtc;
  if (L) {
    maj = Math.min(rMaj, L.total);                       // 전공 우선
    gen = Math.min(rGen, L.gen, L.total - maj);          // 교양 한도와 남은 총 한도 안에서
    etc = Math.min(rEtc, L.total - maj - gen);           // 구분 없는 과목은 남은 범위에서
  }
  const total = maj + gen + etc;
  return { maj, gen, etc, total, rMaj, rGen, rEtc, rTotal, n: ok.length, capped: total < rTotal, L };
}
function crWarn(a, s) {
  if (!s.capped || !s.L) return '';
  return `체크한 학점 ${s.rTotal}학점(전공 ${s.rMaj}, 교양 ${s.rGen}${s.rEtc ? `, 구분 없음 ${s.rEtc}` : ''}) → ${a.transfer_year}학년 편입 최대 인정 기준(총 ${s.L.total}학점, 교양 ${s.L.gen}학점)에 따라 전공 우선으로 ${s.total}학점(전공 ${s.maj}, 교양 ${s.gen}${s.etc ? `, 구분 없음 ${s.etc}` : ''})만 인정합니다.`;
}
const crNum = (v, raw) => `${v}${raw !== v ? ` <small class="muted" title="체크한 학점">/ ${raw}</small>` : ''}`;
const crAutoComment = (school, s) => `${school || '전적대학'}에서 이수한 교과목을 우리대학 ${s.maj ? `전공 ${s.maj}학점` : ''}${s.maj && s.gen ? ', ' : ''}${s.gen ? `교양 ${s.gen}학점` : ''}${!s.maj && !s.gen ? `${s.total}학점` : ''}으로 인정함`;

/* ---------- 화면 ---------- */
function renderCredit() {
  const all = creditAll();
  const depts = S.role === 'dept' ? [] : [...new Set(all.map(a => a.department_id))].map(id => ({ id, nm: deptName(id) })).sort((a, b) => a.nm.localeCompare(b.nm, 'ko'));
  const list = creditTargets();
  const done = all.filter(a => crOf(a.id) && crOf(a.id).submitted).length;
  const intro = S.role === 'dept' ? '소속 학과 편입학 지원자의 학점인정 심의를 입력합니다. 서명 후 제출하면 수정할 수 없으니 확인 후 제출하세요.'
    : can.edit() ? '학과장이 입력한 학점인정 심의를 확인·수정할 수 있습니다. 성적증명서의 과목은 “과목 붙여넣기”로 한 번에 넣을 수 있습니다.'
      : '학과장의 학점인정 심의 결과를 조회합니다.';
  $('#main').innerHTML = `
  <div class="notice">${esc(intro)} <span class="muted">· 인정 한도: 2학년 편입 최대 36학점(교양 6학점), 3학년 편입 최대 72학점(교양 9학점)</span></div>
  ${S.creditReady ? '' : '<div class="warn" style="margin-top:10px">학점인정심사 저장 공간이 DB에 아직 없습니다. 총괄관리자가 sql/2026-11-11_학점인정심사.sql 을 실행해야 저장할 수 있습니다.</div>'}
  <div class="filters" style="margin:10px 0">
    ${depts.length ? `<select onchange="S.creditDept=this.value;renderCredit()"><option value="">전체 학과</option>${depts.map(d => `<option value="${d.id}" ${String(S.creditDept) === String(d.id) ? 'selected' : ''}>${esc(d.nm)}</option>`).join('')}</select>` : ''}
    <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" ${S.creditPending ? 'checked' : ''} onchange="S.creditPending=this.checked;renderCredit()"> 미제출만 보기</label>
    <span class="muted small">편입학 ${all.length}명 · 제출 ${done}명</span>
    <span class="sp"></span>
    <button class="btn" onclick="openCreditPrint()">학점인정 서류 인쇄</button></div>
  ${list.length ? `<div class="ev-list">${list.map(crCardHtml).join('')}</div>`
    : '<div class="center-msg"><div><h2>심의할 편입학 지원자가 없습니다</h2><p>입학구분이 “편입학”인 지원자가 여기에 표시됩니다.</p></div></div>'}`;
}
function crRowHtml(c, ed, i) {
  const v = k => esc(c[k] == null ? '' : c[k]);
  if (!ed) return `<tr><td class="c">${i + 1}</td><td class="c">${v('category') || '-'}</td><td>${v('course_name')}</td><td class="c">${v('credits')}</td><td class="c">${c.recognized ? '<b style="color:var(--pri2)">인정</b>' : ''}</td></tr>`;
  return `<tr class="cr-row"><td class="c">${i + 1}</td>
    <td><select class="cr-cat" onchange="crTotals(this)"><option value="">-</option>${CR_CATS.map(x => `<option ${c.category === x ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
    <td><input class="cr-nm" value="${v('course_name')}" placeholder="예: 항공학개론(Introduction to Aviation)"></td>
    <td><input class="cr-cr" type="number" min="0" step="0.5" value="${v('credits')}" oninput="crTotals(this)" style="width:70px"></td>
    <td class="c cr-okc"><input class="cr-ok" type="checkbox" ${c.recognized ? 'checked' : ''} onchange="crTotals(this)" title="인정"></td>
    <td><button class="btn sm" title="줄 삭제" onclick="const t=this.closest('table');this.closest('tr').remove();crTotals(t)">✕</button></td></tr>`;
}
function crCardHtml(a) {
  const r = crOf(a.id) || {}, rows = crCourses(a.id), ed = crEditable(a.id), sub = !!r.submitted;
  const s = crSums(rows, a), warn = crWarn(a, s);
  const v = k => esc(r[k] == null ? '' : r[k]);
  return `<div class="ev-card cr-card ${sub ? 'done' : ''}" id="cr-${a.id}">
   <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
    <div style="flex:1;min-width:240px"><h3>${esc(a.name_ko)} <span class="muted small">${esc(a.name_en || '')} · ${esc(a.receipt_no)}</span>
      ${sub ? '<span class="pill s-pass">제출 완료</span>' : '<span class="pill s-fix">작성 중</span>'}${sub && r.signature ? ` <span class="sign-mini">${crSignImg(r, '24px')}</span>` : ''}</h3>
     <div class="muted small">${esc(deptName(a.department_id))} · 편입학${a.transfer_year ? ` ${esc(a.transfer_year)}학년` : ''} · ${esc(a.nationality || '')}</div>
     ${typeof appFileBtn === 'function' && typeof afOf === 'function' && afOf(a.id) ? `<div style="margin-top:6px">${appFileBtn(a.id, 'btn sm blue')}</div>` : ''}</div>
    <div class="cr-sum"><div><span>전공 인정</span><b class="cr-maj">${crNum(s.maj, s.rMaj)}</b></div><div><span>교양 인정</span><b class="cr-gen">${crNum(s.gen, s.rGen)}</b></div><div><span>총계</span><b class="cr-tot">${crNum(s.total, s.rTotal)}</b></div></div></div>
   <div class="notice small cr-warn ${warn ? '' : 'hide'}" style="margin-top:8px">ℹ <span>${esc(warn)}</span></div>
   <div class="grid2" style="margin-top:10px">
    ${field(`전적교 대학명${crPartner(a) ? ' <span class="muted small">(협약학교)</span>' : ''}`, ed ? `<input class="cr-ps" value="${esc(crSchool(a))}" placeholder="예: Kyrgyz-Korean College">` : `<div>${esc(crSchool(a)) || '-'}</div>`)}
    ${field('전적교 학년', ed ? `<select class="cr-py"><option value="">-</option>${[1, 2, 3, 4].map(n => `<option value="${n}" ${Number(r.prev_year) === n ? 'selected' : ''}>${n}학년</option>`).join('')}</select>` : `<div>${r.prev_year ? esc(r.prev_year) + '학년' : '-'}</div>`)}
   </div>
   <div class="tbl-wrap" style="margin-top:8px;max-height:420px;overflow:auto"><table class="tbl cr-tbl" style="min-width:640px"><thead><tr><th>NO</th><th>구분</th><th>교과목명</th><th>학점</th><th>인정 여부</th>${ed ? '<th></th>' : ''}</tr></thead>
    <tbody>${rows.map((c, i) => crRowHtml(c, ed, i)).join('') || (ed ? '' : '<tr><td colspan="5" class="muted c">입력된 과목이 없습니다</td></tr>')}</tbody></table></div>
   ${ed ? `<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center"><button class="btn sm" onclick="crAddRow('${a.id}')">＋ 과목 추가</button>
     <button class="btn sm blue" onclick="crPaste('${a.id}')">과목 붙여넣기</button>
     <span class="muted small">성적증명서의 과목을 엑셀이나 Claude가 정리한 표에서 복사해 한 번에 넣을 수 있습니다. 인정하는 과목은 ‘인정 여부’를 체크하세요.</span></div>` : ''}
   <div style="margin-top:10px">${field('학점인정기준 및 심의의견', ed ? `<div style="display:flex;gap:6px;align-items:flex-start"><textarea class="cr-cm" rows="2" style="flex:1">${v('comment')}</textarea><button class="btn sm" onclick="crFillComment('${a.id}')">자동 문구</button></div>` : `<div style="white-space:pre-wrap">${v('comment') || '-'}</div>`)}</div>
   <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;flex-wrap:wrap">
    ${ed && S.creditReady && !sub ? `<button class="btn" onclick="crSave('${a.id}')">임시저장</button>` : ''}
    ${S.role === 'dept' && !sub && S.creditReady ? `<button class="btn pri" onclick="crSubmit('${a.id}')">서명 후 제출</button>` : ''}
    ${can.edit() && sub ? `<button class="btn" onclick="crSave('${a.id}')">수정 저장</button><button class="btn bad" onclick="crUnsubmit('${a.id}')">제출 취소</button>` : ''}
    ${sub ? `<span class="muted small" style="align-self:center">제출 ${fmtDateTime(r.submitted_at)}${r.reviewer_name ? ' · ' + esc(r.reviewer_name) : ''}</span>` : ''}</div></div>`;
}
function crAddRow(id, c) {
  const tb = $(`#cr-${id} .cr-tbl tbody`);
  tb.insertAdjacentHTML('beforeend', crRowHtml(c || {}, true, tb.querySelectorAll('tr').length));
  if (!c) { const ins = tb.querySelectorAll('.cr-nm'); ins[ins.length - 1].focus(); }
}
function crTotals(el) {
  const card = el.closest('.cr-card'); if (!card) return;
  const rows = $$('.cr-row', card).map(tr => ({ category: $('.cr-cat', tr).value, credits: $('.cr-cr', tr).value, recognized: $('.cr-ok', tr).checked }));
  const a = S.apps.find(x => `cr-${x.id}` === card.id), s = crSums(rows, a), w = a ? crWarn(a, s) : '';
  $('.cr-maj', card).innerHTML = crNum(s.maj, s.rMaj); $('.cr-gen', card).innerHTML = crNum(s.gen, s.rGen); $('.cr-tot', card).innerHTML = crNum(s.total, s.rTotal);
  $('.cr-warn', card).classList.toggle('hide', !w); $('.cr-warn span', card).textContent = w;
  $$('.cr-row', card).forEach((tr, i) => { tr.firstElementChild.textContent = i + 1; });
}
function crFillComment(id) {
  const card = $(`#cr-${id}`);
  const rows = $$('.cr-row', card).map(tr => ({ category: $('.cr-cat', tr).value, credits: $('.cr-cr', tr).value, recognized: $('.cr-ok', tr).checked }));
  $('.cr-cm', card).value = crAutoComment($('.cr-ps', card).value.trim(), crSums(rows, S.apps.find(x => x.id === id)));
}
/* 붙여넣기: 한 줄에 한 과목, 칸은 탭(엑셀)으로 구분 — [구분]  교과목명  학점  [인정] */
function crPaste(id) {
  openModal(`${mHead('과목 붙여넣기', '엑셀이나 Claude가 정리한 표를 복사해 아래에 붙여 넣으세요')}
   <div class="m-body">
    <div class="notice small">한 줄에 한 과목씩, 칸 순서는 <b>구분 · 교과목명 · 학점 · 인정여부</b>입니다. 구분(전공/교양)과 인정여부(인정/O)는 비워도 됩니다.<br>
     예) <code>전공	Java Script	3	인정</code> · <code>Korean	2</code></div>
    <textarea id="crp-in" rows="12" style="font-family:monospace" placeholder="여기에 붙여 넣기 (Ctrl+V)" oninput="crPastePreview()"></textarea>
    <label style="display:flex;gap:6px;align-items:center"><input id="crp-rep" type="checkbox" checked style="width:auto"> 기존 과목을 지우고 바꾸기 (끄면 아래에 추가)</label>
    <div id="crp-pv" class="muted small"></div></div>
   <div class="m-foot"><button class="btn" onclick="closeModal(this.closest('.backdrop'))">취소</button><button class="btn pri" id="crp-go" disabled onclick="crPasteApply('${id}')">넣기</button></div>`, { wide: true, sticky: true });
}
function crParse(text) {
  return String(text || '').split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim()).map(line => {
    let cells = line.includes('\t') ? line.split('\t') : line.split(/\s{2,}|\s*\|\s*/);
    cells = cells.map(x => x.trim()).filter((x, i, arr) => x !== '' || (i > 0 && i < arr.length - 1));
    if (/^\d+$/.test(cells[0]) && cells.length > 2 && !/^\d+(\.\d+)?$/.test(cells[1])) cells.shift(); // 맨 앞 NO 제거
    let category = '';
    if (cells.length > 1 && (CR_CATS.includes(cells[0]) || cells[0] === '-')) { const c = cells.shift(); category = c === '-' ? '' : c; }
    let recognized = false;
    const last = (cells[cells.length - 1] || '').trim();
    if (/^(인정|o|O|y|Y|✓|v|V)$/.test(last)) { recognized = true; cells.pop(); }
    let credits = null;
    if (cells.length > 1 && /^\d+(\.\d+)?$/.test(cells[cells.length - 1])) credits = Number(cells.pop());
    const course_name = cells.join(' ').trim();
    return course_name ? { category: category || null, course_name, credits, recognized } : null;
  }).filter(Boolean);
}
function crPastePreview() {
  const rows = crParse($('#crp-in').value);
  $('#crp-pv').innerHTML = rows.length ? `${rows.length}과목 인식 · 학점 합계 ${rows.reduce((t, c) => t + (c.credits || 0), 0)} · 학점 없는 줄 ${rows.filter(c => c.credits == null).length}개
    <div class="tbl-wrap" style="max-height:200px;overflow:auto;margin-top:6px"><table class="tbl"><tbody>${rows.slice(0, 50).map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.category || '-')}</td><td>${esc(c.course_name)}</td><td>${c.credits == null ? '?' : c.credits}</td><td>${c.recognized ? '인정' : ''}</td></tr>`).join('')}</tbody></table></div>` : '';
  $('#crp-go').disabled = !rows.length;
  $('#crp-go').textContent = rows.length ? `${rows.length}과목 넣기` : '넣기';
}
function crPasteApply(id) {
  const rows = crParse($('#crp-in').value);
  if ($('#crp-rep').checked) $$(`#cr-${id} .cr-row`).forEach(tr => tr.remove());
  rows.forEach(c => crAddRow(id, c));
  crTotals($(`#cr-${id} .cr-tbl`));
  closeModal();
  toast(`${rows.length}과목을 넣었습니다. 구분·인정 여부를 확인하고 “임시저장”을 눌러 주세요.`);
}
function crRead(id) {
  const card = $(`#cr-${id}`);
  const review = { applicant_id: id, prev_school: $('.cr-ps', card).value.trim() || null, prev_year: Number($('.cr-py', card).value) || null,
    comment: $('.cr-cm', card).value.trim() || null, reviewer: S.user.id, updated_at: new Date().toISOString() };
  const courses = $$('.cr-row', card).map((tr, i) => ({ applicant_id: id, seq: i + 1, category: $('.cr-cat', tr).value || null, course_name: $('.cr-nm', tr).value.trim() || null,
    credits: $('.cr-cr', tr).value === '' ? null : Number($('.cr-cr', tr).value), recognized: $('.cr-ok', tr).checked }))
    .filter(c => c.course_name || c.credits != null);
  return { review, courses };
}
async function crPersist(id, extra) {
  const { review, courses } = crRead(id);
  if (courses.some(c => c.credits != null && !(c.credits >= 0))) { toast('학점은 0 이상의 숫자로 입력하세요.', 'err'); return false; }
  const row = { ...review, ...(extra || {}) };
  const r1 = await sb.from('credit_reviews').upsert(row, { onConflict: 'applicant_id' });
  if (r1.error) { toast('저장 실패: ' + errMsg(r1.error), 'err'); return false; }
  const r2 = await sb.from('credit_review_courses').delete().eq('applicant_id', id);
  if (r2.error) { toast('과목 저장 실패: ' + errMsg(r2.error), 'err'); return false; }
  if (courses.length) {
    const r3 = await sb.from('credit_review_courses').insert(courses);
    if (r3.error) { toast('과목 저장 실패: ' + errMsg(r3.error), 'err'); return false; }
  }
  S.credit[id] = { ...(S.credit[id] || {}), ...row };
  S.creditCourses[id] = courses;
  return true;
}
async function crSave(id) {
  setBusy(true);
  const ok = await crPersist(id);
  setBusy(false);
  if (ok) { toast('저장했습니다.'); renderCredit(); }
}
function crSubmit(id) {
  const a = S.apps.find(x => x.id === id), { review, courses } = crRead(id);
  if (!review.prev_school) { toast('전적교 대학명을 입력하세요.', 'err'); return; }
  if (!courses.length) { toast('사정표에 과목을 1개 이상 입력하세요.', 'err'); return; }
  if (courses.some(c => c.credits == null)) { toast('학점이 비어 있는 과목이 있습니다.', 'err'); return; }
  const s = crSums(courses, a), w = crWarn(a, s);
  if (!review.comment) { $(`#cr-${id} .cr-cm`).value = crAutoComment(review.prev_school, s); }
  const prev = lastSign();
  const bd = openModal(`${mHead('학점인정 심의 제출 · 학과장 서명', `${esc(a.name_ko)} · ${esc(a.receipt_no)}`)}
   <div class="m-body">
    <div class="kv"><div><span>전공 인정</span><b>${s.maj}학점</b></div><div><span>교양 인정</span><b>${s.gen}학점</b></div><div><span>총계</span><b>${s.total}학점</b></div></div>
    ${w ? `<div class="notice small">ℹ ${esc(w)}</div>` : ''}
    <div class="warn">아래 칸에 서명하세요. 제출 후에는 수정할 수 없습니다.</div>
    <div class="sign-wrap"><canvas id="sign-pad"></canvas><div class="sign-hint" id="sign-hint">여기에 서명</div></div>
    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn sm" onclick="clearSignPad()">지우기</button>${prev ? '<button class="btn sm" onclick="useLastSign()">지난번 서명 사용</button>' : ''}</div></div>
   <div class="m-foot"><button class="btn" onclick="closeModal(this.closest('.backdrop'))">취소</button><button class="btn pri" id="cr-sign-ok" onclick="crSubmitSigned('${id}')">서명하고 제출</button></div>`, { sticky: true });
  initSignPad($('#sign-pad', bd));
}
async function crSubmitSigned(id) {
  const cv = $('#sign-pad'), url = cv && cv._signed ? signDataUrl(cv) : '';
  if (!url) { toast('서명을 해야 제출할 수 있습니다.', 'err'); return; }
  $('#cr-sign-ok').disabled = true;
  const ok = await crPersist(id, { submitted: true, submitted_at: new Date().toISOString(), review_date: todayYMD(), signature: url, reviewer_name: (S.profile && S.profile.display_name) || null });
  if (!ok) { $('#cr-sign-ok').disabled = false; return; }
  try { localStorage.setItem(SIGN_KEY(), url); } catch (e) { /* 무시 */ }
  closeModal(cv.closest('.backdrop'));
  toast('학점인정 심의를 제출했습니다.');
  renderCredit();
}
async function crUnsubmit(id) {
  const a = S.apps.find(x => x.id === id);
  if (!confirm(`${a.name_ko} 지원자의 학점인정 심의 제출을 취소하고 학과장이 다시 수정할 수 있게 합니다. (서명도 지워집니다)`)) return;
  const { error } = await sb.from('credit_reviews').update({ submitted: false, submitted_at: null, signature: null }).eq('applicant_id', id);
  if (error) { toast(errMsg(error), 'err'); return; }
  Object.assign(S.credit[id], { submitted: false, submitted_at: null, signature: null });
  toast('제출을 취소했습니다.'); renderCredit();
}
const crSignImg = (r, h) => (r && r.signature && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(r.signature) ? `<img src="${r.signature}" alt="서명" style="height:${h};vertical-align:middle">` : '');
const crDots = ymd => { const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]} . ${+m[2]}. ${+m[3]}.` : '      .     .     .'; };
const crKoDate = ymd => { const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}년 ${+m[2]}월 ${+m[3]}일` : '        년     월     일'; };

/* ---------- 인쇄: 학교 양식 ---------- */
function openCreditPrint() {
  const list = creditTargets();
  if (!list.length) { toast('인쇄할 편입학 지원자가 없습니다.', 'err'); return; }
  const groups = crGroups(list);
  openModal(`${mHead('학점인정 서류 인쇄', `${S.creditDept ? esc(deptName(S.creditDept)) : '전체 학과'} · 편입학 ${list.length}명`)}
   <div class="m-body">
    <label style="display:flex;gap:8px;align-items:center;font-weight:600"><input id="cp-op" type="checkbox" checked style="width:auto"> 편입학 성적인정 검토 의견서 (학과별 1장)</label>
    <label style="display:flex;gap:8px;align-items:center;font-weight:600"><input id="cp-rv" type="checkbox" checked style="width:auto"> 편입학 지원자 학점인정 심의 (학생별 사정표)</label>
    <div class="sec"><h3>검토의견 (의견서에 들어갈 문구)</h3>
     ${groups.map(g => field(esc(deptName(g.d)), `<textarea class="cp-cm" data-d="${g.d}" rows="2">${esc(crDeptComment(g.apps))}</textarea>`)).join('')}</div></div>
   <div class="m-foot"><button class="btn" onclick="closeModal(this.closest('.backdrop'))">취소</button><button class="btn pri" onclick="runCreditPrint()">인쇄</button></div>`, { wide: true, sticky: true });
}
function crGroups(list) {
  const gs = [];
  list.forEach(a => { let g = gs.find(x => x.d === a.department_id); if (!g) gs.push(g = { d: a.department_id, apps: [] }); g.apps.push(a); });
  return gs;
}
function crDeptComment(apps) {
  const schools = [...new Set(apps.map(a => crSchool(a)).filter(Boolean))];
  return `${schools.join(', ') || '전적대학'}에서 이수한 교과목을 편입학 지원자 학점인정 심의 내용과 같이 우리대학 학점으로 인정함`;
}
function runCreditPrint() {
  const op = $('#cp-op').checked, rv = $('#cp-rv').checked;
  if (!op && !rv) { toast('인쇄할 서류를 고르세요.', 'err'); return; }
  const cm = Object.fromEntries($$('.cp-cm').map(t => [t.dataset.d, t.value.trim()]));
  let html = '';
  crGroups(creditTargets()).forEach(g => {
    if (op) html += crOpinionHtml(g.d, g.apps, cm[g.d]);
    if (rv) g.apps.forEach(a => { html += crReviewHtml(a); });
  });
  closeModal();
  printHtml(html);
}
/* 「편입학 성적인정 검토 의견서」 (학과별) */
function crOpinionHtml(d, apps, comment) {
  const sub = apps.map(a => crOf(a.id)).filter(r => r && r.submitted);
  const last = sub.sort((x, y) => String(y.submitted_at).localeCompare(String(x.submitted_at)))[0] || {};
  return `<div class="doc sheet cr-doc">
   <div class="cr-term">${crTermTitle()}</div><h2 class="cr-title">편입학 성적인정 검토 의견서</h2>
   <h4 class="cr-h">1. 학적사항</h4>
   <table class="cr-t"><thead><tr><th colspan="4">전 적 교</th><th colspan="3">본 대 학</th></tr>
    <tr><th>대학명</th><th>학년</th><th>성명</th><th>영문명</th><th>지원학과</th><th>학년</th><th>성명</th></tr></thead>
    <tbody>${apps.map(a => { const r = crOf(a.id) || {}; return `<tr><td>${esc(crSchool(a))}</td><td>${r.prev_year ? esc(r.prev_year) : ''}</td><td>${esc(a.name_ko)}</td><td class="en">${esc(a.name_en || '')}</td>
      <td>${esc(deptName(a.department_id))}</td><td>${a.transfer_year ? esc(a.transfer_year) : ''}</td><td>${esc(a.name_ko)}</td></tr>`; }).join('')}</tbody></table>
   <h4 class="cr-h">2. 성적사항</h4>
   <table class="cr-t"><thead><tr><th colspan="5">전적교 이수(취득)성적 현황</th><th colspan="5">본대학 성적인정(학점) 현황</th></tr>
    <tr><th>구분</th><th>교과목명</th><th>성적</th><th>학점</th><th>비고</th><th>구분</th><th>교과목명</th><th>성적</th><th>학점</th><th>비고</th></tr></thead>
    <tbody><tr><td></td><td>붙임참조</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr></tbody></table>
   <h4 class="cr-h">3. 검토의견</h4>
   <div class="cr-cm">${esc(comment || '')}</div>
   <div class="cr-date">${crDots(last.review_date || (last.submitted_at || '').slice(0, 10))}</div>
   <div class="cr-sig"><span>${esc(deptName(d))} 학과장</span><span class="nm">${esc(last.reviewer_name || '')}</span><span class="ln">${crSignImg(last, '13mm')}</span><span>(인)</span></div></div>`;
}
/* 「편입학 지원자 학점인정 심의」 사정표 (학생별, 과목이 많으면 여러 쪽) */
function crReviewHtml(a) {
  const r = crOf(a.id) || {}, rows = crCourses(a.id), s = crSums(rows, a);
  const PER = 36, half = PER / 2;
  const chunks = rows.length ? chunk(rows.map((c, i) => ({ ...c, no: i + 1 })), PER) : [[]];
  const cell = c => (c ? `<td>${c.no}</td><td>${esc(c.category || '-')}</td><td class="l">${esc(c.course_name || '')}</td><td>${c.credits == null ? '' : esc(c.credits)}</td><td class="ok">${c.recognized ? '인정' : ''}</td>`
    : '<td>&nbsp;</td><td></td><td></td><td></td><td></td>');
  return chunks.map((part, pi) => {
    const L = part.slice(0, half), R = part.slice(half);
    const n = Math.max(L.length, R.length, pi === chunks.length - 1 ? 0 : half, 1);
    const lastPage = pi === chunks.length - 1;
    return `<div class="doc sheet cr-doc">
     <div class="cr-box"><div class="cr-term">${crTermTitle()}</div><h2 class="cr-title">편입학 지원자 학점인정 심의</h2></div>
     <table class="cr-t cr-head"><tbody><tr><th>수험번호</th><td>${esc(a.receipt_no)}</td><th>성명</th><td>${esc(a.name_ko)}</td><th>지원학과</th><td>${esc(deptName(a.department_id))}</td></tr></tbody></table>
     <div class="cr-sub">편입학 지원자 학점인정 사정표${chunks.length > 1 ? ` (${pi + 1}/${chunks.length})` : ''}</div>
     <table class="cr-t cr-grid"><colgroup>${'<col class="w-no"><col class="w-cat"><col><col class="w-cr"><col class="w-ok">'.repeat(2)}</colgroup><thead><tr><th>NO</th><th>구분</th><th>교과목명</th><th>학점</th><th>인정<br>여부</th><th>NO</th><th>구분</th><th>교과목명</th><th>학점</th><th>인정<br>여부</th></tr></thead>
      <tbody>${Array.from({ length: n }, (_, i) => `<tr>${cell(L[i])}${cell(R[i])}</tr>`).join('')}</tbody></table>
     ${lastPage ? `<div class="cr-note">※ 전적대학 학점 인정은 2학년 편입학 최대 36학점, 3학년 편입학 최대 72학점까지 가능<br>※ 교양 학점은 2학년 편입학 최대 6학점, 3학년 편입학 최대 9학점까지 인정</div>
     <div class="cr-op">◎ 학점인정기준 및 심의의견 : <span>${esc(r.comment || crAutoComment(crSchool(a), s))}</span></div>
     <table class="cr-t cr-tot"><tbody><tr><th>전공인정학점</th><td>${s.maj}</td><th>교양인정학점</th><td>${s.gen}</td><th>총계</th><td>${s.total}</td></tr></tbody></table>
     <div class="cr-end">위와 같이 학점인정 심의함</div>
     <div class="cr-date">${crKoDate(r.review_date || (r.submitted_at || '').slice(0, 10))}</div>
     <div class="cr-sig"><span>학과(부) : ${esc(deptName(a.department_id))}</span><span style="margin-left:8mm">학과(부)장 :</span><span class="nm">${esc(r.reviewer_name || '')}</span><span class="ln">${r.submitted ? crSignImg(r, '13mm') : ''}</span></div>` : ''}</div>`;
  }).join('');
}
