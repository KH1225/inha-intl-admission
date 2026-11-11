'use strict';
/* ===== 지원자 상세 / 등록·수정 / 서류 체크 / 납부 ===== */
const NATIONS = ['우즈베키스탄', '일본', '베트남', '몽골', '키르기스스탄', '러시아', '중국', '카자흐스탄', '네팔', '인도네시아', '태국', '필리핀', '미얀마', '방글라데시', '스리랑카', '캄보디아', '인도', '파키스탄', '타지키스탄', '투르크메니스탄', '미국', '대만'];

function evalSummary(id, type) {
  const e = S.evals[id + '|' + type];
  if (!e) return '미작성';
  const g = [e.item1, e.item2, e.item3].map(x => (x || '-').trim()).join('-');
  return `${g} ${e.result ? '[' + e.result + ']' : ''}${e.submitted ? '' : ' (임시저장)'}`;
}

/* ---------- 상세 ---------- */
function openDetail(id, focus) {
  const a = S.apps.find(x => x.id === id);
  if (!a) return;
  const full = hasFull(a);
  const d = S.deptMap[a.department_id] || {};
  const iv = S.interviews[id] || {};
  const docTypes = S.docTypes.filter(t => docVisible(t, a));
  const pay = S.payments[id];

  const kv = (l, v) => `<div><span>${l}</span><b>${v == null || v === '' ? '-' : esc(v)}</b></div>`;
  const basic = `<div class="sec"><h3>기본 정보</h3><div class="basic-wrap">${photoUrl(a) ? `<img class="photo" src="${esc(photoUrl(a))}" alt="사진">` : `<div class="photo none">사진 없음</div>`}<div style="flex:1"><div class="kv">
    ${kv('한글 성명', a.name_ko)}${kv('영문 성명', a.name_en)}${kv('성별', a.gender)}${kv('생년월일', a.birth_date)}${kv('국적', a.nationality)}
    ${kv('입학구분', a.admission_kind + (a.transfer_year ? ` (${a.transfer_year}학년 편입)` : ''))}${kv('지원학과', d.name_ko)}${kv('전형', qualName(a.qualification_code))}
    ${full ? kv('지원경로', routeLabel(a)) : ''}
    ${kv('어학능력', a.topik_level ? `TOPIK ${a.topik_level}급` : '')}${kv('출신 고교', (a.high_school || '') + (a.domestic_hs ? ' (국내 고교)' : ''))}${kv('GPA(내신)', a.gpa)}
    ${full ? kv('여권번호', a.passport_last4 ? '****' + a.passport_last4 : '') + kv('여권 만료일', a.passport_expiry) + kv('비자', a.visa_type) + kv('이메일', a.email) + (a.cc_emails ? kv('추가 이메일', a.cc_emails) : '') + kv('연락처', a.phone) + kv('기숙사 신청', a.dorm_application ? '신청' + (dormRoom(a.dorm_room) ? ` — ${dormRoom(a.dorm_room).ko}` : '') : '미신청') : ''}
    ${kv('지원일자', fmtDate(a.created_at))}</div></div></div>
    ${full && can.edit() ? `<div style="margin-top:10px"><button class="btn sm" onclick="showSecrets('${id}')">여권번호·외국인등록번호 원문 보기</button>
      <span class="secret" id="secrets"></span><div class="muted small">※ 원문을 볼 때마다 열람 기록이 남습니다. 20초 뒤 자동으로 가려집니다.</div></div>` : ''}
    ${full && a.memo ? `<div style="margin-top:10px"><span class="muted small">비고</span><div>${esc(a.memo)}</div></div>` : ''}</div>`;

  const docs = full ? `<div class="sec" id="sec-docs"><h3>제출서류 체크리스트 <span class="muted small">${esc(docKindOf(a) === '전공심화' ? '전공심화과정' : a.admission_kind)} · ${a.qualification_code ? esc(qualLabel(a.qualification_code)) : '전형유형 미선택'} · 필수 서류 ${docProgress(a).got}/${docProgress(a).need} 구비</span></h3>
    ${a.qualification_code ? '' : '<div class="warn" style="margin-bottom:8px">전형유형(순수외국인 / 전교육과정 해외이수)을 선택해야 필수 서류가 정해집니다. “정보 수정”에서 선택하세요.</div>'}
    ${docTypes.length ? `<div class="doclist">${docTypes.map(t => {
      const r = S.docs[id] && S.docs[id][t.code];
      return `<label><input type="checkbox" ${r && r.received ? 'checked' : ''} ${can.edit() ? '' : 'disabled'} onchange="toggleDoc('${id}','${t.code}',this.checked)"><span>${esc(t.name_ko)} ${docExempt(t, a) ? `<span class="op">면제 (${esc(docExempt(t, a))})</span>` : docRequired(t, a) ? '<span class="rq">필수</span>' : '<span class="op">선택</span>'}</span></label>`;
    }).join('')}</div>` : '<div class="muted">등록된 서류 항목이 없습니다.</div>'}</div>` : '';

  const interview = `<div class="sec"><h3>면접</h3><div class="kv">
    ${kv('면접 순서', orderOf(a) == null ? '미지정' : orderOf(a) + '번')}${kv('면접 일정', iv.scheduled_at ? fmtDateTime(iv.scheduled_at) : (a.scheduled_at ? fmtDateTime(a.scheduled_at) : ''))}
    ${kv('국제교류원장 평가', S.role === 'dept' ? '(비공개)' : evalSummary(id, '원장'))}${kv('학과장 평가', evalSummary(id, '학과장'))}</div></div>`;

  const schol = full && can.broad() ? `<div class="sec"><h3>장학금 <span>${can.edit() ? `<button class="btn sm" onclick="openScholEdit('${id}')">직접 지정</button>
      ${a.scholarship_source === '수동' ? `<button class="btn sm" onclick="resetSchol('${id}')">자동으로 되돌리기</button>` : ''}` : ''}</span></h3><div class="kv">
    ${kv('적용 장학금', a.scholarship_type || '없음')}${kv('감면율', a.scholarship_pct ? a.scholarship_pct + '%' : '')}${kv('감면액', a.scholarship_amount ? won(a.scholarship_amount) : '')}${kv('배정 방식', a.scholarship_source)}</div></div>` : '';

  const payment = pay ? `<div class="sec"><h3>등록금 · 납부</h3><div class="kv">${kv('등록금', won(pay.tuition_amount))}${kv('장학금', won(pay.scholarship_amount))}${kv('납부할 금액', won(pay.payable_amount))}</div>
    ${can.edit() ? `<div class="grid3" style="margin-top:10px">${field('납부 금액(원)', `<input id="pay-amt" type="number" min="0" value="${esc(pay.paid_amount == null ? '' : pay.paid_amount)}">`)}
      ${field('납부일', `<input id="pay-at" type="date" min="1900-01-01" max="9999-12-31" value="${esc(pay.paid_at || '')}">`)}${field('메모', `<input id="pay-memo" value="${esc(pay.memo || '')}">`)}</div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri sm" onclick="savePayment('${id}')">납부 정보 저장</button>
      ${a.status === '최종합격' && pay.paid_at ? `<button class="btn ok sm" onclick="markRegistered('${id}')">등록완료 처리</button>` : ''}</div>`
      : `<div class="kv" style="margin-top:8px">${kv('납부 금액', won(pay.paid_amount))}${kv('납부일', pay.paid_at)}</div>`}</div>` : '';

  const history = full && can.broad() ? `<div class="sec"><h3>이력</h3><div id="hist" class="muted small">불러오는 중…</div></div>` : '';

  const bd = openModal(`${mHead(`${esc(a.name_ko)} <span class="rno">${esc(a.receipt_no)}</span> <span class="pill ${STATUS_CLS[a.status]}">${esc(a.status)}</span>`, esc(a.name_en))}
    <div class="m-body">${basic}${docs}${appFileSecHtml(a)}${interview}${schol}${payment}${history}</div>
    <div class="m-foot">${can.edit() ? `<button class="btn" onclick="closeModal(this.closest('.backdrop'));openApplicantForm('${id}')">정보 수정</button>
      <button class="btn" onclick="closeModal(this.closest('.backdrop'));openPrintMenu('${id}')">문서 인쇄</button>` : ''}
      ${can.edit() && !['등록완료', '접수취소'].includes(a.status) ? `<button class="btn bad" onclick="cancelApplication('${id}')">접수 취소</button>` : ''}
      ${can.admin() && a.status === '접수취소' ? `<button class="btn" onclick="restoreApplication('${id}')">취소 철회</button>` : ''}
      ${can.admin() ? `<button class="btn bad" onclick="deleteApplicant('${id}')">삭제</button>` : ''}
      <button class="btn pri" onclick="closeModal(this.closest('.backdrop'))">닫기</button></div>`, { wide: true });
  if (focus === 'docs') { const el = $('#sec-docs', bd); if (el) setTimeout(() => el.scrollIntoView({ block: 'center' }), 50); }
  if (full && can.broad()) loadHistory(id);
}
async function loadHistory(id) {
  const el = $('#hist'); if (!el) return;
  try {
    const [h, i] = await Promise.all([
      sb.from('status_history').select('*').eq('applicant_id', id).order('changed_at'),
      sb.from('issued_documents').select('*').eq('applicant_id', id).order('issued_at')
    ]);
    if (h.error) throw h.error; if (i.error) throw i.error;
    const hs = (h.data || []).map(r => `<li>${fmtDateTime(r.changed_at)} · ${r.from_status ? esc(r.from_status) + ' → ' : ''}<b>${esc(r.to_status)}</b></li>`).join('');
    const is = (i.data || []).map(r => `<li>${fmtDateTime(r.issued_at)} · ${esc(r.doc_type)} <b>${esc(r.doc_no)}</b>${r.reissue_no ? ` (재발급 ${r.reissue_no}차)` : ''}</li>`).join('');
    el.innerHTML = `<div class="grid2"><div><b>상태 변경 이력</b><ul>${hs || '<li>없음</li>'}</ul></div><div><b>문서 발급 이력</b><ul>${is || '<li>없음</li>'}</ul></div></div>`;
  } catch (e) { el.textContent = errMsg(e); }
}
async function showSecrets(id) {
  const el = $('#secrets');
  const { data, error } = await sb.rpc('get_applicant_secrets', { p_id: id });
  if (error) { toast(errMsg(error), 'err'); return; }
  const r = Array.isArray(data) ? data[0] : data;
  el.textContent = ` 여권번호: ${r && r.o_passport_no ? r.o_passport_no : '-'}   외국인등록번호: ${r && r.o_alien_reg_no ? r.o_alien_reg_no : '-'}`;
  setTimeout(() => { const e2 = $('#secrets'); if (e2) e2.textContent = ''; }, 20000);
}
async function toggleDoc(id, code, checked) {
  const row = { received: checked, received_at: checked ? todayYMD() : null };
  let { data, error } = await sb.from('applicant_documents').update(row).eq('applicant_id', id).eq('doc_code', code).select();
  if (!error && (!data || !data.length)) ({ error } = await sb.from('applicant_documents').insert({ applicant_id: id, doc_code: code, ...row }));
  if (error) { toast(errMsg(error), 'err'); return; }
  (S.docs[id] = S.docs[id] || {})[code] = { applicant_id: id, doc_code: code, ...row };
  renderTable();
}
async function savePayment(id) {
  const amt = $('#pay-amt').value, at = $('#pay-at').value;
  const { error } = await sb.from('payments').update({ paid_amount: amt === '' ? null : Number(amt), paid_at: at || null, memo: $('#pay-memo').value.trim() || null }).eq('applicant_id', id);
  if (error) { toast(errMsg(error), 'err'); return; }
  toast('납부 정보를 저장했습니다.');
  closeModal(); await reloadAndRender(); openDetail(id);
}
async function markRegistered(id) {
  if (!confirm('등록완료로 처리할까요?')) return;
  const { error } = await sb.from('applicants').update({ status: '등록완료' }).eq('id', id);
  if (error) { toast(errMsg(error), 'err'); return; }
  await syncScholarships();
  toast('등록완료 처리되었습니다.');
  closeModal(); await reloadAndRender(); openDetail(id);
}
/* ---------- 접수 취소 / 철회 ---------- */
async function cancelApplication(id) {
  const a = S.apps.find(x => x.id === id);
  if (!a) return;
  const reason = (prompt(`${a.name_ko} (${a.receipt_no}) 지원자의 접수를 취소합니다.\n취소 사유를 입력하세요. (예: 본인 요청, 타 대학 진학, 비자 거절)`) || '').trim();
  if (!reason) { toast('취소 사유를 입력해야 접수를 취소할 수 있습니다.', 'err'); return; }
  const line = `[접수취소 ${todayYMD()}] ${reason}`;
  const memo = a.memo ? `${a.memo}\n${line}` : line;
  setBusy(true);
  const { error } = await sb.from('applicants').update({ status: '접수취소', memo }).eq('id', id);
  setBusy(false);
  if (error) { toast(/check constraint|invalid input value/i.test(errMsg(error)) ? '데이터베이스에 접수취소 상태가 아직 없습니다. 관리자에게 SQL 적용을 요청하세요.' : errMsg(error), 'err'); return; }
  a.status = '접수취소';
  await syncScholarships();
  toast(`${a.name_ko}: 접수취소 처리되었습니다.`);
  closeModal(); await reloadAndRender();
}
async function restoreApplication(id) {
  const a = S.apps.find(x => x.id === id);
  if (!a || !confirm(`${a.name_ko} 지원자의 접수 취소를 철회하고 '서류심사' 상태로 되돌립니다.\n(필요하면 이후에 상태를 다시 바꿔 주세요.)`)) return;
  const line = `[취소철회 ${todayYMD()}]`;
  const memo = a.memo ? `${a.memo}\n${line}` : line;
  setBusy(true);
  const { error } = await sb.from('applicants').update({ status: '서류심사', memo }).eq('id', id);
  setBusy(false);
  if (error) { toast(errMsg(error), 'err'); return; }
  if (a.scholarship_source === '수동' && !a.scholarship_type) await sb.rpc('reset_scholarship_auto', { p_applicant: id });
  await syncScholarships();
  toast(`${a.name_ko}: 서류심사 상태로 되돌렸습니다.`);
  closeModal(); await reloadAndRender(); openDetail(id);
}
async function deleteApplicant(id) {
  const a = S.apps.find(x => x.id === id);
  if (!confirm(`${a.name_ko} (${a.receipt_no}) 지원자를 완전히 삭제합니다.\n되돌릴 수 없습니다. 계속할까요?`)) return;
  if (!confirm('정말 삭제할까요? 서류·면접·납부 기록도 함께 삭제됩니다.')) return;
  const { error } = await sb.from('applicants').delete().eq('id', id);
  if (error) { toast(/foreign key|violates/i.test(errMsg(error)) ? '문서 발급 기록이 있어 삭제할 수 없습니다.' : errMsg(error), 'err'); return; }
  toast('삭제했습니다.');
  closeModal(); await reloadAndRender();
}

/* ---------- 장학금 직접 지정 ---------- */
function openScholEdit(id) {
  const a = S.apps.find(x => x.id === id);
  openModal(`${mHead('장학금 직접 지정', esc(a.name_ko))}<div class="m-body">
    <div class="warn">직접 지정하면 자동 배정이 이 지원자를 건드리지 않습니다. 감면액은 등록금 기준으로 다시 계산됩니다.</div>
    <div class="grid2">${field('장학금 이름', `<input id="se-type" value="${esc(a.scholarship_type || '')}" placeholder="예: 토픽 장학금">`)}
    ${field('감면율(%)', `<input id="se-pct" type="number" min="0" max="100" step="0.01" value="${esc(a.scholarship_pct || 0)}">`)}</div></div>
    <div class="m-foot"><button class="btn" onclick="closeModal(this.closest('.backdrop'))">취소</button><button class="btn pri" onclick="saveScholEdit('${id}')">저장</button></div>`);
}
async function saveScholEdit(id) {
  const pct = Number($('#se-pct').value || 0), type = $('#se-type').value.trim() || null;
  if (pct < 0 || pct > 100) { toast('감면율은 0~100 사이로 입력하세요.', 'err'); return; }
  const { data, error } = await sb.from('applicants').update({ scholarship_pct: pct, scholarship_type: type }).eq('id', id).select('scholarship_amount').single();
  if (error) { toast(errMsg(error), 'err'); return; }
  if (S.payments[id] && !S.payments[id].paid_at) await sb.from('payments').update({ scholarship_amount: data.scholarship_amount }).eq('applicant_id', id);
  toast('저장했습니다.');
  closeModal(); closeModal(); await reloadAndRender(); openDetail(id);
}
async function resetSchol(id) {
  const { error } = await sb.rpc('reset_scholarship_auto', { p_applicant: id });
  if (error) { toast(errMsg(error), 'err'); return; }
  if ((await syncScholarships()).error) return;
  toast('자동 배정으로 되돌렸습니다.');
  closeModal(); await reloadAndRender(); openDetail(id);
}
/* ---------- 등록 / 수정 폼 ---------- */
let pendingPhoto = null;
async function onPhotoPick(file) {
  pendingPhoto = null;
  if (!file) return;
  try {
    pendingPhoto = await resizePhoto(file);
    $('#af-prev').classList.remove('none');
    $('#af-prev').innerHTML = `<img src="${URL.createObjectURL(pendingPhoto)}" alt="">`;
    const d = $('#af-photo-del'); if (d) d.checked = false;
  } catch (e) { toast(errMsg(e), 'err'); $('#af-photo').value = ''; }
}
/* 국적: 목록에서 고르고, 목록에 없으면 '기타(직접 입력)' */
function natSelectHtml(cur) {
  cur = cur || '';
  const other = cur && !NATIONS.includes(cur);
  return `<select id="af-nat-sel" onchange="onNatSel(this.value)"><option value="">선택</option>
    ${NATIONS.map(n => `<option ${n === cur ? 'selected' : ''}>${n}</option>`).join('')}
    <option value="__other" ${other ? 'selected' : ''}>기타 (직접 입력)</option></select>
   <input id="af-nationality" class="${other ? '' : 'hide'}" style="margin-top:6px" placeholder="국적을 한글로 입력" value="${esc(cur)}">`;
}
function onNatSel(val) {
  const inp = $('#af-nationality');
  if (val === '__other') { inp.value = ''; inp.classList.remove('hide'); inp.focus(); }
  else { inp.value = val; inp.classList.add('hide'); }
}
/* 유학원: 드롭다운에서 '+ 새 유학원 추가'를 고르면 바로 등록 */
async function onAgencySel(el) {
  if (el.value !== '__new') return;
  el.value = '';
  const nm = (prompt('추가할 유학원 이름을 입력하세요.') || '').trim();
  if (!nm) return;
  const dup = S.agencies.find(x => x.name.toLowerCase() === nm.toLowerCase());
  let ag = dup;
  if (!dup) {
    const { data, error } = await sb.from('agencies').insert({ name: nm }).select().single();
    if (error) { toast('유학원 추가 실패: ' + errMsg(error), 'err'); return; }
    ag = data; S.agencies.push(ag); S.agencies.sort((x, y) => x.name.localeCompare(y.name)); S.agencyMap[ag.id] = ag;
  }
  if (!el.querySelector(`option[value="${ag.id}"]`)) el.querySelector('option[value="__new"]').insertAdjacentHTML('beforebegin', `<option value="${ag.id}">${esc(ag.name)}</option>`);
  el.value = String(ag.id);
  toast(dup ? `이미 있는 유학원 “${ag.name}”을 선택했습니다.` : `유학원 “${ag.name}”을 추가했습니다.`);
}
/* 지원학과 목록: 편입학이면 편입 모집 학과만 */
function afDeptOptions(kind, curId) {
  return S.depts.filter(d => (d.active || d.id === curId) && (kind !== '편입학' || isTransferDept(d)))
    .map(d => `<option value="${d.id}" ${String(curId) === String(d.id) ? 'selected' : ''}>${esc(d.name_ko)}${d.program_type === '전공심화' ? ' [전공심화]' : ''}</option>`).join('');
}
function afRefreshDepts() {
  const kind = $('#af-admission_kind').value, el = $('#af-department_id'), cur = el.value;
  el.innerHTML = `<option value="">선택</option>${afDeptOptions(kind, cur)}`;
  if (cur && !el.querySelector(`option[value="${cur}"]`)) { el.value = ''; toast(`편입학은 ${TRANSFER_DEPTS.join(', ')}만 지원할 수 있어 지원학과 선택을 비웠습니다.`); }
  $('#af-tr-note').classList.toggle('hide', kind !== '편입학');
}
function openApplicantForm(id) {
  pendingPhoto = null;
  const edit = !!id;
  const a = edit ? S.apps.find(x => x.id === id) : { admission_kind: '신입학', route: '개별지원', gender: '' };
  const v = k => esc(a[k] == null ? '' : a[k]);
  const sel = (k, val) => (String(a[k]) === String(val) ? 'selected' : '');
  const deptOpts = afDeptOptions(a.admission_kind, a.department_id);
  const html = `${mHead(edit ? '지원자 정보 수정' : '지원자 추가', edit ? esc(a.receipt_no) : `${esc(S.term.name)} 모집`)}
  <div class="m-body"><div id="af-err" class="err-box hide"></div>
   <div class="sec"><h3>사진 <span class="muted small">여권용 사진 (JPG·PNG, 자동으로 줄여서 저장됩니다)</span></h3>
    <div class="photo-edit"><div id="af-prev" class="photo ${photoUrl(a) ? '' : 'none'}">${photoUrl(a) ? `<img src="${esc(photoUrl(a))}" alt="">` : '사진 없음'}</div>
     <div><input type="file" id="af-photo" accept="image/*" onchange="onPhotoPick(this.files[0])">
     ${a.photo_path ? `<label style="display:flex;gap:6px;align-items:center;margin-top:8px;font-weight:500"><input type="checkbox" id="af-photo-del" style="width:auto"> 현재 사진 삭제</label>` : ''}</div></div></div>
   <div class="sec"><h3>기본 정보</h3><div class="grid2">
    ${field('한글 성명', `<input id="af-name_ko" value="${v('name_ko')}">`, { req: 1 })}
    ${field('영문 성명 (여권과 동일)', `<input id="af-name_en" value="${v('name_en')}" style="text-transform:uppercase">`, { req: 1 })}
    ${field('성별', `<select id="af-gender"><option value="">선택</option><option ${sel('gender', '남')}>남</option><option ${sel('gender', '여')}>여</option></select>`, { req: 1 })}
    ${field('생년월일', `<input id="af-birth_date" type="date" min="1900-01-01" max="9999-12-31" value="${v('birth_date')}">`, { req: 1 })}
    ${field('국적', natSelectHtml(a.nationality), { req: 1 })}
    ${field('접수번호 (비우면 자동 부여)', `<input id="af-receipt_no" value="${v('receipt_no')}" ${edit ? 'disabled' : ''} placeholder="ITC-${S.term.year}-000">`)}
   </div></div>
   <div class="sec"><h3>지원 정보</h3><div class="grid2">
    ${field('입학구분', `<select id="af-admission_kind" onchange="$('#af-ty').classList.toggle('hide',this.value!=='편입학');afRefreshDepts()"><option ${sel('admission_kind', '신입학')}>신입학</option><option ${sel('admission_kind', '편입학')}>편입학</option></select>`, { req: 1 })}
    <label class="fld ${a.admission_kind === '편입학' ? '' : 'hide'}" id="af-ty"><span>편입 학년</span><select id="af-transfer_year"><option value="">선택</option><option value="2" ${sel('transfer_year', 2)}>2학년</option><option value="3" ${sel('transfer_year', 3)}>3학년</option></select></label>
    ${field('지원학과', `<select id="af-department_id"><option value="">선택</option>${deptOpts}</select>`, { req: 1 })}
    <div class="muted small ${a.admission_kind === '편입학' ? '' : 'hide'}" id="af-tr-note" style="grid-column:1/-1;margin-top:-6px">편입학은 ${esc(TRANSFER_DEPTS.join(', '))}만 지원할 수 있습니다.</div>
    ${field('전형유형', `<select id="af-qualification_code"><option value="">선택</option>${S.quals.map(q => `<option value="${q.code}" ${sel('qualification_code', q.code)}>${esc(q.name_ko)}</option>`).join('')}</select>`)}
    ${field('지원경로', `<select id="af-route" onchange="$('#af-ag').classList.toggle('hide',this.value!=='유학원');$('#af-ps-lbl').textContent=this.value===ROUTE_PARTNER?'협약학교 *':'협약학교 (협약 장학금 대상)'"><option ${sel('route', '개별지원')}>개별지원</option><option ${sel('route', '유학원')}>유학원</option><option value="${ROUTE_PARTNER}" ${sel('route', ROUTE_PARTNER)}>${ROUTE_PARTNER_LABEL}</option><option ${sel('route', ROUTE_ALUMNI)}>${ROUTE_ALUMNI}</option></select>`)}
    <label class="fld ${a.route === '유학원' ? '' : 'hide'}" id="af-ag"><span>유학원</span><select id="af-agency_id" onchange="onAgencySel(this)"><option value="">선택</option>${S.agencies.filter(x => x.active || x.id === a.agency_id).map(x => `<option value="${x.id}" ${sel('agency_id', x.id)}>${esc(x.name)}</option>`).join('')}${can.edit() ? '<option value="__new">+ 새 유학원 추가</option>' : ''}</select></label>
    ${field('어학능력 (TOPIK)', `<select id="af-topik_level"><option value="">없음</option>${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${sel('topik_level', n)}>${n}급</option>`).join('')}</select>`)}
    ${field(`<span id="af-ps-lbl">${a.route === ROUTE_PARTNER ? '협약학교 *' : '협약학교 (협약 장학금 대상)'}</span>`, `<select id="af-partner_school_id"><option value="">해당 없음</option>${S.partners.filter(p => p.active || p.id === a.partner_school_id).map(p => `<option value="${p.id}" ${sel('partner_school_id', p.id)}>${esc(p.name)}</option>`).join('')}</select>`)}
   </div></div>
   <div class="sec"><h3>신원 · 연락처 <span class="muted small">민감정보 · 저장 시 암호화됩니다</span></h3><div class="grid2">
    ${field(edit ? '여권번호 (바꿀 때만 입력)' : '여권번호', `<input id="af-passport_no" autocomplete="off" placeholder="${edit && a.passport_last4 ? '현재: ****' + esc(a.passport_last4) : ''}">`, { req: !edit })}
    ${field('여권 만료일', `<input id="af-passport_expiry" type="date" min="1900-01-01" max="9999-12-31" value="${v('passport_expiry')}">`)}
    ${field('비자 종류', `<input id="af-visa_type" value="${v('visa_type')}" placeholder="예: D-4, H-1 · 등록완료">`)}
    ${field(edit ? '외국인등록번호 (바꿀 때만 입력)' : '외국인등록번호', `<input id="af-alien_reg_no" autocomplete="off">`)}
    ${field('이메일', `<input id="af-email" type="email" value="${v('email')}">`)}
    ${field('연락처', `<input id="af-phone" value="${v('phone')}">`)}
    ${S.hasCol && S.hasCol.cc_emails ? field('추가 이메일 (보호자·유학원 등, 쉼표로 구분 · 최대 3개)', `<input id="af-cc_emails" value="${v('cc_emails')}" placeholder="예: parent@example.com, agency@example.com">`, { full: 1 }) : ''}
    ${field('출신 고교', `<input id="af-high_school" value="${v('high_school')}">`)}
    ${S.noDomHs ? '' : `<label class="fld"><span>국내 고교 출신 (신입학)</span><label style="display:flex;gap:6px;align-items:center;font-weight:500"><input id="af-domestic_hs" type="checkbox" style="width:auto" ${a.domestic_hs ? 'checked' : ''}> 한국 고등학교 졸업(예정) — 외국학교 학력조회 동의서 면제</label></label>`}
    ${field('GPA (내신)', `<input id="af-gpa" type="number" step="0.01" min="0" value="${v('gpa')}">`)}
    <label class="fld"><span>기숙사</span><label style="display:flex;gap:6px;align-items:center;font-weight:500"><input id="af-dorm" type="checkbox" style="width:auto" ${a.dorm_application ? 'checked' : ''} onchange="if(!this.checked&&$('#af-dorm_room'))$('#af-dorm_room').value=''"> 기숙사 신청</label></label>
    ${S.hasCol && S.hasCol.dorm_room ? field('기숙사 기간 · 객실 유형', `<select id="af-dorm_room" onchange="if(this.value)$('#af-dorm').checked=true"><option value="">미정</option>${DORM_FEES.map(x => `<option value="${x.k}" ${a.dorm_room === x.k ? 'selected' : ''}>${esc(x.ko)} — ${won(x.amt)}</option>`).join('')}</select>`) : ''}
    ${field('비고 메모', `<textarea id="af-memo" rows="2">${v('memo')}</textarea>`, { full: 1 })}
   </div></div></div>
  <div class="m-foot"><button class="btn" onclick="closeModal(this.closest('.backdrop'))">취소</button><button class="btn pri" id="af-save" onclick="saveApplicant('${id || ''}')">저장</button></div>`;
  openModal(html, { wide: true, sticky: true });
}
async function saveApplicant(id) {
  const g = k => { const el = $('#af-' + k); return el ? el.value.trim() : ''; };
  const errs = [];
  const kind = g('admission_kind'), route = g('route');
  const p = {
    name_ko: g('name_ko'), name_en: g('name_en').toUpperCase(), gender: g('gender'), birth_date: g('birth_date'), nationality: g('nationality'),
    admission_kind: kind, transfer_year: kind === '편입학' && g('transfer_year') ? Number(g('transfer_year')) : null,
    department_id: Number(g('department_id')) || null, qualification_code: g('qualification_code') || null,
    route, agency_id: route === '유학원' ? (Number(g('agency_id')) || null) : null,
    topik_level: g('topik_level') ? Number(g('topik_level')) : null, partner_school_id: Number(g('partner_school_id')) || null,
    passport_expiry: g('passport_expiry') || null, visa_type: g('visa_type') || null, email: g('email') || null, phone: g('phone') || null,
    high_school: g('high_school') || null, gpa: g('gpa') !== '' ? Number(g('gpa')) : null, dorm_application: $('#af-dorm').checked, memo: g('memo') || null
  };
  if ($('#af-cc_emails')) {
    const cc = splitEmails(g('cc_emails'));
    if (cc.some(e => !emailValid(e))) errs.push('추가 이메일 형식을 확인하세요.');
    if (cc.length > 3) errs.push('추가 이메일은 3개까지 넣을 수 있습니다.');
    p.cc_emails = cc.join(', ') || null;
  }
  if ($('#af-dorm_room')) p.dorm_room = p.dorm_application ? ($('#af-dorm_room').value || null) : null;
  if (!S.noDomHs && $('#af-domestic_hs')) p.domestic_hs = kind === '신입학' && $('#af-domestic_hs').checked;
  if (!p.name_ko) errs.push('한글 성명을 입력하세요.');
  if (!p.name_en) errs.push('영문 성명을 입력하세요.');
  if (!p.gender) errs.push('성별을 선택하세요.');
  const ymdOk = v => /^(19|20)\d{2}-\d{2}-\d{2}$/.test(v);
  if (!p.birth_date) errs.push('생년월일을 입력하세요.');
  else if (!ymdOk(p.birth_date) || p.birth_date > todayYMD()) errs.push('생년월일을 확인하세요. (연도 4자리, 예: 2004-01-05)');
  if (p.passport_expiry && !ymdOk(p.passport_expiry)) errs.push('여권 만료일을 확인하세요. (연도 4자리)');
  if (!p.nationality) errs.push('국적을 입력하세요.');
  if (!p.department_id) errs.push('지원학과를 선택하세요.');
  if (kind === '편입학' && !p.transfer_year) errs.push('편입 학년을 선택하세요.');
  if (kind === '편입학' && p.department_id && !isTransferDept(S.deptMap[p.department_id])) errs.push(`편입학은 ${TRANSFER_DEPTS.join(', ')}만 지원할 수 있습니다.`);
  if (route === '유학원' && !p.agency_id) errs.push('유학원을 선택하세요.');
  if (route === ROUTE_PARTNER && !p.partner_school_id) errs.push('협약학교를 선택하세요.');
  if (p.email && !/^\S+@\S+\.\S+$/.test(p.email)) errs.push('이메일 형식을 확인하세요.');
  if (!id && !g('passport_no')) errs.push('여권번호를 입력하세요.');
  const box = $('#af-err');
  if (errs.length) { box.textContent = errs.join('\n'); box.classList.remove('hide'); box.scrollIntoView({ block: 'center' }); return; }
  box.classList.add('hide');
  if (g('passport_no')) p.passport_no = g('passport_no');
  if (g('alien_reg_no')) p.alien_reg_no = g('alien_reg_no');
  const btn = $('#af-save'); btn.disabled = true;
  let error, savedId = id, photoErr = '';
  if (id) ({ error } = await sb.from('applicants').update(p).eq('id', id));
  else { p.term_id = S.term.id; if (g('receipt_no')) p.receipt_no = g('receipt_no'); const r = await sb.from('applicants').insert(p).select('id').single(); error = r.error; if (r.data) savedId = r.data.id; }
  if (error) { btn.disabled = false; box.textContent = errMsg(error); box.classList.remove('hide'); return; }
  try {
    if (pendingPhoto) await savePhoto(savedId, pendingPhoto);
    else if ($('#af-photo-del') && $('#af-photo-del').checked) await removePhoto(savedId);
  } catch (e) { photoErr = errMsg(e); }
  await syncScholarships();
  btn.disabled = false; pendingPhoto = null;
  if (photoErr) toast('정보는 저장했지만 사진 저장에 실패했습니다: ' + photoErr, 'err');
  else toast(id ? '수정했습니다.' : '지원자를 등록했습니다.');
  closeModal();
  await reloadAndRender();
}
