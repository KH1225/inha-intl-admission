'use strict';
/* ===== 총괄관리자 설정: 등록금·등록기간, 새 학기, 장학금, 계정 ===== */
const TERM_DATE_FIELDS = [['apply_start', '원서접수 시작'], ['apply_end', '원서접수 마감'], ['interview_start', '면접 시작'], ['interview_end', '면접 종료'], ['announce_date', '합격자 발표·고지일'], ['register_start', '등록기간 시작'], ['register_end', '등록기간 마감'], ['entry_date', '입학일']];
const TERM_BANK_FIELDS = [['bank_name', '은행명 (Bank)'], ['account_holder', '예금주 (Account holder)'], ['account_no', '계좌번호 (Account No.)'], ['swift_code', 'SWIFT 코드'], ['bank_address', '은행/학교 주소 (Address)']];

function termFormHtml(t, pfx) {
  const v = k => esc(t[k] == null ? '' : t[k]);
  return `<div class="sec"><h3>등록금 <span class="muted small">매년 이곳에서 수정합니다</span></h3><div class="grid2">
    ${field('첫 학기 등록금(원) — 장학금 감면 계산의 기준', `<input id="${pfx}first_tuition" type="number" min="0" value="${v('first_tuition')}">`, { req: 1 })}
    ${field('이후 학기 등록금(원)', `<input id="${pfx}later_tuition" type="number" min="0" value="${v('later_tuition')}">`, { req: 1 })}</div></div>
   <div class="sec"><h3>일정 · 등록기간</h3><div class="grid2">
    ${TERM_DATE_FIELDS.map(([k, l]) => field(l, `<input id="${pfx}${k}" type="date" min="1900-01-01" max="9999-12-31" value="${v(k)}">`)).join('')}</div></div>
   <div class="sec"><h3>해외송금 계좌 <span class="muted small">등록금고지서에 인쇄됩니다</span></h3><div class="grid2">
    ${TERM_BANK_FIELDS.map(([k, l]) => field(l, `<input id="${pfx}${k}" value="${v(k)}">`, { full: k === 'bank_address' })).join('')}</div></div>`;
}
function readTermForm(pfx) {
  const o = {};
  const g = k => $('#' + pfx + k).value.trim();
  o.first_tuition = Number(g('first_tuition')); o.later_tuition = Number(g('later_tuition'));
  TERM_DATE_FIELDS.forEach(([k]) => { o[k] = g(k) || null; });
  TERM_BANK_FIELDS.forEach(([k]) => { o[k] = g(k) || null; });
  return o;
}
function validTerm(o) {
  if (!(o.first_tuition >= 0) || isNaN(o.first_tuition) || !(o.later_tuition >= 0) || isNaN(o.later_tuition)) return '등록금을 숫자로 입력하세요.';
  if (TERM_DATE_FIELDS.some(([k]) => o[k] && !/^\d{4}-\d{2}-\d{2}$/.test(o[k]))) return '날짜의 연도는 4자리로 입력하세요.';
  if (o.register_start && o.register_end && o.register_start > o.register_end) return '등록기간의 시작일이 마감일보다 늦습니다.';
  return '';
}

function openTuitionSettings() {
  const t = S.term;
  openModal(`${mHead('등록금 &amp; 등록기간 설정', esc(t.name))}<div class="m-body">${termFormHtml(t, 'ts-')}
   <div class="warn">“저장”은 이후 새로 합격 처리되는 지원자부터 적용됩니다. 이미 합격 처리된 지원자(납부 전)까지 바꾸려면 “저장 및 전체 일괄 적용”을 누르세요. 납부 완료된 건은 변경되지 않습니다.</div></div>
   <div class="m-foot"><button class="btn" onclick="closeModal(this.closest('.backdrop'))">취소</button>
   <button class="btn" onclick="saveTuition(false)">저장</button><button class="btn pri" onclick="saveTuition(true)">저장 및 전체 일괄 적용</button></div>`, { wide: true, sticky: true });
}
async function saveTuition(applyAll) {
  const o = readTermForm('ts-'); const er = validTerm(o);
  if (er) { toast(er, 'err'); return; }
  if (applyAll && !confirm('납부 전인 모든 합격자의 등록금과 장학금 감면액을 새 금액으로 다시 계산합니다. 계속할까요?')) return;
  setBusy(true);
  const { error } = await sb.from('terms').update(o).eq('id', S.term.id);
  if (error) { setBusy(false); toast(errMsg(error), 'err'); return; }
  if (applyAll) {
    const r = await sb.rpc('apply_term_tuition', { p_term: S.term.id });
    if (r.error) { setBusy(false); toast(errMsg(r.error), 'err'); return; }
    toast(`저장했고 ${r.data}건에 일괄 적용했습니다.`);
  } else toast('저장했습니다.');
  Object.assign(S.term, o);
  await loadStatic(); S.term = S.terms.find(x => x.id === S.term.id);
  setBusy(false);
  closeModal(); await reloadAndRender();
}

function openNewTerm() {
  const cur = S.term || {};
  const y = (cur.year || new Date().getFullYear()) + 1;
  openModal(`${mHead('새 모집학기 만들기', '현재 학기의 등록금·계좌 정보를 복사해 시작합니다')}<div class="m-body">
   <div class="grid2">${field('학년도', `<input id="nt-year" type="number" value="${y}">`, { req: 1 })}
   ${field('학기', `<select id="nt-sem"><option>전기</option><option>후기</option></select>`, { req: 1 })}</div>
   ${termFormHtml({ ...cur, apply_start: '', apply_end: '', interview_start: '', interview_end: '', announce_date: '', register_start: '', register_end: '', entry_date: '' }, 'nt-')}
   <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="nt-cur" checked style="width:auto"> 이 학기를 현재 모집학기로 설정</label></div>
   <div class="m-foot"><button class="btn" onclick="closeModal(this.closest('.backdrop'))">취소</button><button class="btn pri" onclick="saveNewTerm()">만들기</button></div>`, { wide: true, sticky: true });
}
async function saveNewTerm() {
  const year = Number($('#nt-year').value), semester = $('#nt-sem').value;
  if (!year || year < 2000) { toast('학년도를 확인하세요.', 'err'); return; }
  const o = readTermForm('nt-'); const er = validTerm(o);
  if (er) { toast(er, 'err'); return; }
  const mkCur = $('#nt-cur').checked;
  o.year = year; o.semester = semester; o.name = `${year}-${semester}`;
  if (mkCur) { const r = await sb.from('terms').update({ is_current: false }).eq('is_current', true); if (r.error) { toast(errMsg(r.error), 'err'); return; } }
  o.is_current = mkCur;
  const { data, error } = await sb.from('terms').insert(o).select().single();
  if (error) { toast(/duplicate/i.test(errMsg(error)) ? '이미 같은 이름의 학기가 있습니다.' : errMsg(error), 'err'); return; }
  toast(`${o.name} 학기를 만들었습니다.`);
  await loadStatic(); S.term = S.terms.find(x => x.id === data.id);
  closeModal(); await reloadAndRender();
}

/* ---------- 장학금 관리 ---------- */
function openScholarship() {
  const rule = c => S.rules.find(r => r.code === c) || {};
  const root = rule('ROOT'), adv = rule('ADVANCED'), top = rule('TOPIK'), par = rule('PARTNER');
  const partnerRow = p => `<tr data-pid="${p.id}"><td><input class="pn" value="${esc(p.name)}"></td>
    <td><select class="pt"><option value="금액" ${p.discount_type === '금액' ? 'selected' : ''}>금액(고정)</option><option value="비율" ${p.discount_type === '비율' ? 'selected' : ''}>비율(%)</option></select></td>
    <td><input class="pc" style="width:56px" value="${esc(p.condition_label)}"></td>
    <td><input class="pa" type="number" min="0" style="width:110px" value="${esc(p.discount_amount)}"></td>
    <td><input class="pp" type="number" min="0" max="100" step="0.01" style="width:70px" value="${esc(p.discount_pct)}"></td>
    <td><input class="pk" type="checkbox" ${p.active ? 'checked' : ''}></td></tr>`;
  const counts = {};
  S.apps.forEach(a => { if (a.scholarship_type) counts[a.scholarship_type] = (counts[a.scholarship_type] || 0) + 1; });
  openModal(`${mHead('장학금 관리', '우선순위: ① 토픽 → ② 뿌리산업 → ③ 협약학교 → ④ 전공심화(단독). 중복 합산 없이 가장 먼저 해당되는 장학금 1개만 적용됩니다.')}
  <div class="m-body">
   <div class="sec"><h3>① 토픽(TOPIK) 장학금 <label class="small" style="font-weight:500"><input type="checkbox" id="sc-top-on" ${top.active !== false ? 'checked' : ''} style="width:auto"> 사용</label></h3>
    <div class="grid3">${[1, 2, 3, 4, 5, 6].map(l => { const r = S.topik.find(x => x.level === l) || { pct: 0 }; return field(`${l}급 감면율(%)`, `<input class="tk" data-l="${l}" type="number" min="0" max="100" step="0.01" value="${esc(r.pct)}">`); }).join('')}</div></div>
   <div class="sec"><h3>② 뿌리산업 장학금 <label class="small" style="font-weight:500"><input type="checkbox" id="sc-root-on" ${root.active !== false ? 'checked' : ''} style="width:auto"> 사용</label></h3>
    <div class="grid2">${field('감면율(%) — 뿌리산업양성학과(조선기계공학과) 지원자', `<input id="sc-root" type="number" min="0" max="100" step="0.01" value="${esc(root.flat_pct == null ? 30 : root.flat_pct)}">`)}</div></div>
   <div class="sec"><h3>③ 협약학교 장학금 <label class="small" style="font-weight:500"><input type="checkbox" id="sc-par-on" ${par.active !== false ? 'checked' : ''} style="width:auto"> 사용</label></h3>
    <div class="tbl-wrap"><table class="tbl" style="min-width:640px"><thead><tr><th>협약학교(기관)</th><th>방식</th><th>조건</th><th>고정금액(원)</th><th>비율(%)</th><th>사용</th></tr></thead><tbody id="sc-par">${S.partners.map(partnerRow).join('')}</tbody></table></div>
    <div style="margin-top:8px"><button class="btn sm" onclick="addPartnerRow()">＋ 협약학교 추가</button> <span class="muted small">방식이 “금액”이면 고정금액, “비율”이면 비율(%)이 적용됩니다. 지원자 등록 시 협약학교를 선택해야 적용됩니다.</span></div></div>
   <div class="sec"><h3>④ 전공심화 장학금 <label class="small" style="font-weight:500"><input type="checkbox" id="sc-adv-on" ${adv.active !== false ? 'checked' : ''} style="width:auto"> 사용</label></h3>
    <div class="grid2">${field('감면율(%) — 전공심화과정 지원자에게만 단독 적용', `<input id="sc-adv" type="number" min="0" max="100" step="0.01" value="${esc(adv.flat_pct == null ? 25 : adv.flat_pct)}">`)}</div></div>
   <div class="sec"><h3>${esc(S.term.name)} 배정 현황</h3>${Object.keys(counts).length ? Object.entries(counts).map(([k, n]) => `<span class="pill s-review" style="margin:2px">${esc(k)} ${n}명</span>`).join('') : '<span class="muted">아직 배정된 장학금이 없습니다.</span>'}</div>
  </div>
  <div class="m-foot"><button class="btn" onclick="closeModal(this.closest('.backdrop'))">닫기</button>
   <button class="btn" onclick="saveScholarship(false)">저장</button><button class="btn pri" onclick="saveScholarship(true)">저장 후 일괄 자동 배정</button></div>`, { wide: true, sticky: true });
}
let newPartnerSeq = 0;
function addPartnerRow() {
  newPartnerSeq++;
  $('#sc-par').insertAdjacentHTML('beforeend', `<tr data-new="${newPartnerSeq}"><td><input class="pn" placeholder="기관명"></td>
   <td><select class="pt"><option value="금액">금액(고정)</option><option value="비율">비율(%)</option></select></td><td><input class="pc" style="width:56px" value="A"></td>
   <td><input class="pa" type="number" min="0" style="width:110px" value="0"></td><td><input class="pp" type="number" min="0" max="100" step="0.01" style="width:70px" value="0"></td><td><input class="pk" type="checkbox" checked></td></tr>`);
}
async function saveScholarship(assign) {
  const num0 = id => Number($(id).value || 0);
  const pcts = [num0('#sc-root'), num0('#sc-adv'), ...$$('.tk').map(i => Number(i.value || 0)), ...$$('.pp').map(i => Number(i.value || 0))];
  if (pcts.some(x => isNaN(x) || x < 0 || x > 100)) { toast('감면율은 0~100 사이여야 합니다.', 'err'); return; }
  setBusy(true);
  try {
    const ups = [
      sb.from('scholarship_rules').update({ active: $('#sc-top-on').checked }).eq('code', 'TOPIK'),
      sb.from('scholarship_rules').update({ flat_pct: num0('#sc-root'), active: $('#sc-root-on').checked }).eq('code', 'ROOT'),
      sb.from('scholarship_rules').update({ active: $('#sc-par-on').checked }).eq('code', 'PARTNER'),
      sb.from('scholarship_rules').update({ flat_pct: num0('#sc-adv'), active: $('#sc-adv-on').checked }).eq('code', 'ADVANCED')
    ];
    $$('.tk').forEach(i => ups.push(sb.from('topik_rates').update({ pct: Number(i.value || 0) }).eq('level', Number(i.dataset.l))));
    for (const tr of $$('#sc-par tr')) {
      const row = { name: $('.pn', tr).value.trim(), discount_type: $('.pt', tr).value, condition_label: $('.pc', tr).value.trim() || 'A', discount_amount: Number($('.pa', tr).value || 0), discount_pct: Number($('.pp', tr).value || 0), active: $('.pk', tr).checked };
      if (!row.name) continue;
      ups.push(tr.dataset.pid ? sb.from('partner_schools').update(row).eq('id', Number(tr.dataset.pid)) : sb.from('partner_schools').insert(row));
    }
    const res = await Promise.all(ups);
    const bad = res.find(r => r.error); if (bad) throw bad.error;
    let msg = '저장했습니다.';
    if (assign) {
      const r = await sb.rpc('auto_assign_scholarships', { p_term: S.term.id });
      if (r.error) throw r.error;
      msg = `저장했고 ${r.data}명의 장학금이 변경되었습니다.`;
    }
    await loadStatic();
    setBusy(false); toast(msg);
    closeModal(); await reloadAndRender();
  } catch (e) { setBusy(false); toast(errMsg(e), 'err'); }
}

/* ---------- 계정 관리 ---------- */
async function openAccounts() {
  const { data, error } = await sb.from('profiles').select('*').order('role').order('display_name');
  if (error) { toast(errMsg(error), 'err'); return; }
  S.profiles = data || [];
  const deptSel = (id, cls) => `<select class="${cls}"><option value="">-</option>${S.depts.map(d => `<option value="${d.id}" ${d.id === id ? 'selected' : ''}>${esc(d.name_ko)}</option>`).join('')}</select>`;
  const roleSel = (r, cls) => `<select class="${cls}">${Object.keys(ROLE_LABEL).map(k => `<option value="${k}" ${k === r ? 'selected' : ''}>${esc(ROLE_LABEL[k])}</option>`).join('')}</select>`;
  openModal(`${mHead('계정 관리', '로그인 계정은 Supabase → Authentication → Users에서 만든 뒤, 여기서 권한을 지정합니다')}
  <div class="m-body"><div class="tbl-wrap"><table class="tbl" style="min-width:720px"><thead><tr><th>이름</th><th>권한</th><th>학과(학과장만)</th><th>사용</th><th></th></tr></thead><tbody>
  ${S.profiles.map(p => `<tr data-id="${p.id}"><td><input class="an" value="${esc(p.display_name)}"></td><td>${roleSel(p.role, 'ar')}</td><td>${deptSel(p.department_id, 'ad')}</td>
   <td><input class="aa" type="checkbox" ${p.active ? 'checked' : ''} ${p.id === S.user.id ? 'disabled' : ''}></td>
   <td><button class="btn sm" onclick="saveAccount('${p.id}',this)">저장</button></td></tr>`).join('')}</tbody></table></div>
  <div class="sec" style="margin-top:14px"><h3>권한 추가</h3>
   <div class="muted small" style="margin-bottom:6px">Supabase에서 사용자를 만든 뒤 표시되는 “User UID”를 붙여 넣으세요.</div>
   <div class="grid2">${field('User UID', '<input id="na-id" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">')}${field('표시 이름', '<input id="na-name">')}
   ${field('권한', roleSel('staff', 'x').replace('class="x"', 'id="na-role"'))}${field('학과 (학과장만)', deptSel(null, 'x').replace('class="x"', 'id="na-dept"'))}</div>
   <div style="margin-top:8px"><button class="btn pri" onclick="addAccount()">추가</button></div></div></div>
  <div class="m-foot"><button class="btn pri" onclick="closeModal(this.closest('.backdrop'))">닫기</button></div>`, { wide: true });
}
async function saveAccount(id, btn) {
  const tr = btn.closest('tr');
  const role = $('.ar', tr).value, dept = $('.ad', tr).value;
  if (role === 'dept' && !dept) { toast('학과장은 학과를 선택해야 합니다.', 'err'); return; }
  const row = { display_name: $('.an', tr).value.trim(), role, department_id: role === 'dept' ? Number(dept) : null };
  if (id !== S.user.id) row.active = $('.aa', tr).checked;
  if (id === S.user.id && role !== 'admin') { toast('본인의 총괄관리자 권한은 바꿀 수 없습니다.', 'err'); return; }
  if (!row.display_name) { toast('이름을 입력하세요.', 'err'); return; }
  const { error } = await sb.from('profiles').update(row).eq('id', id);
  if (error) { toast(errMsg(error), 'err'); return; }
  toast('저장했습니다.');
}
async function addAccount() {
  const id = $('#na-id').value.trim(), name = $('#na-name').value.trim(), role = $('#na-role').value, dept = $('#na-dept').value;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) { toast('User UID 형식이 올바르지 않습니다.', 'err'); return; }
  if (!name) { toast('이름을 입력하세요.', 'err'); return; }
  if (role === 'dept' && !dept) { toast('학과장은 학과를 선택해야 합니다.', 'err'); return; }
  const { error } = await sb.from('profiles').insert({ id, display_name: name, role, department_id: role === 'dept' ? Number(dept) : null });
  if (error) { toast(errMsg(error), 'err'); return; }
  toast('추가했습니다.');
  closeModal(); openAccounts();
}
