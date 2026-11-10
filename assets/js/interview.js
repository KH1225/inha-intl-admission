'use strict';
/* ===== 면접 평가 (국제교류원장 / 학과장), 면접 순서, 전송현황 ===== */
const EV_ITEMS = ['전공적합성 및 학업의지', '발표력/표현력 및 인성', '한국어 구사능력/의사소통'];
const EV_GRADES = { A: '우수(탁월)', B: '보통(적격)', C: '미흡(불합격)' };

const myEvalType = () => (S.role === 'director' ? '원장' : S.role === 'dept' ? '학과장' : null);
const getEv = (id, t) => S.evals[id + '|' + t] || null;
function draftOf(id) {
  const t = myEvalType();
  if (!S.evalDraft[id]) {
    const e = getEv(id, t) || {};
    S.evalDraft[id] = { item1: e.item1 || '', item2: e.item2 || '', item3: e.item3 || '', comment: e.comment || '', result: e.result || '' };
  }
  return S.evalDraft[id];
}
function autoResult(d) {
  const g = [d.item1, d.item2, d.item3];
  if (g.some(x => !x)) return g.includes('C') ? '불합격' : '';
  return g.includes('C') ? '불합격' : '합격';
}

function evalTargets() {
  let list = S.apps.filter(a => S.interviews[a.id] || a.status === '면접심사');
  if (S.evalFilter.dept) list = list.filter(a => String(a.department_id) === String(S.evalFilter.dept));
  if (S.evalFilter.pending && myEvalType()) {
    const t = myEvalType();
    list = list.filter(a => !(getEv(a.id, t) && getEv(a.id, t).submitted));
  }
  return list.sort((x, y) => {
    const ox = orderOf(x), oy = orderOf(y);
    if (ox != null && oy != null && ox !== oy) return ox - oy;
    if ((ox == null) !== (oy == null)) return ox == null ? 1 : -1;
    return String(x.receipt_no).localeCompare(String(y.receipt_no));
  });
}

function renderEval() {
  const t = myEvalType();
  const list = evalTargets();
  const depts = S.role === 'dept' ? [] : S.depts.filter(d => S.apps.some(a => a.department_id === d.id && (S.interviews[a.id] || a.status === '면접심사')));
  const intro = t === '원장'
    ? '국제교류원장으로서 전 학과 지원자를 평가합니다. 학과장 평가는 참고용으로 표시됩니다.'
    : t === '학과장'
      ? '소속 학과 지원자만 표시됩니다. 제출하면 수정할 수 없으니 확인 후 제출하세요.'
      : (can.admin() ? '면접 순서를 지정하고 평가 진행 상황을 확인할 수 있습니다. (평가 입력은 원장·학과장만 가능)' : '평가 진행 상황을 조회합니다.');
  $('#main').innerHTML = `
  <div class="notice">${esc(intro)}</div>
  <div class="filters" style="margin:10px 0">
    ${depts.length ? `<select onchange="S.evalFilter.dept=this.value;renderEval()"><option value="">전체 학과</option>${depts.map(d => `<option value="${d.id}" ${String(S.evalFilter.dept) === String(d.id) ? 'selected' : ''}>${esc(d.name_ko)}</option>`).join('')}</select>` : ''}
    ${t ? `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" ${S.evalFilter.pending ? 'checked' : ''} onchange="S.evalFilter.pending=this.checked;renderEval()"> 미제출만 보기</label>` : ''}
    <span class="sp"></span>
    ${can.admin() ? `<button class="btn" onclick="openOrderModal()">면접 순서 · 일정 지정</button>` : ''}
    <button class="btn" onclick="printEvalSheet()">면접평가표 인쇄</button></div>
  ${list.length ? `<div class="ev-list">${list.map(a => t ? evalCardEdit(a, t) : evalCardView(a)).join('')}</div>`
    : '<div class="center-msg"><div><h2>평가할 지원자가 없습니다</h2><p>면접심사 단계로 변경된 지원자가 여기에 표시됩니다.</p></div></div>'}`;
}

function evBadge(e) {
  if (!e) return '<span class="muted">미작성</span>';
  return `${[e.item1, e.item2, e.item3].map(x => x || '-').join(' / ')} → <b>${esc(e.result || '-')}</b>${e.submitted ? ' (제출됨)' : ' (임시저장)'}`;
}
function evalCardView(a) {
  const e1 = getEv(a.id, '원장'), e2 = getEv(a.id, '학과장'), o = orderOf(a);
  const done = e1 && e1.submitted;
  return `<div class="ev-card ${done ? 'done' : ''}"><div class="ev-row">${avatarHtml(a, 'ev-photo')}<div class="ev-main"><h3>${o != null ? `<span class="rno">${o}번</span> ` : ''}${esc(a.name_ko)} <span class="muted small">${esc(a.name_en)} · ${esc(a.receipt_no)}</span> <span class="pill ${STATUS_CLS[a.status]}">${esc(a.status)}</span></h3>
   <div class="muted small">${esc(deptName(a.department_id))} · ${esc(a.nationality)}${a.topik_level ? ' · TOPIK ' + a.topik_level + '급' : ''}</div>
   <div class="kv" style="margin-top:8px"><div><span>국제교류원장</span><b>${evBadge(e1)}</b></div><div><span>학과장</span><b>${evBadge(e2)}</b></div></div>
   ${e1 && e1.comment ? `<div class="muted small" style="margin-top:6px">원장 의견: ${esc(e1.comment)}</div>` : ''}
   ${can.admin() && (e1 && e1.submitted || e2 && e2.submitted) ? `<div style="margin-top:8px">
     ${e2 && e2.submitted ? `<button class="btn sm" onclick="cancelSubmit('${a.id}','학과장')">학과장 제출 취소</button>` : ''}
     ${e1 && e1.submitted ? `<button class="btn sm" onclick="cancelSubmit('${a.id}','원장')">원장 제출 취소</button>` : ''}</div>` : ''}</div></div></div>`;
}
function evalCardEdit(a, t) {
  const d = draftOf(a.id), e = getEv(a.id, t) || {};
  const locked = !!e.submitted || (a.status !== '면접심사');
  const o = orderOf(a);
  const res = d.result || autoResult(d);
  const ref = t === '원장' ? getEv(a.id, '학과장') : null;
  const items = EV_ITEMS.map((nm, i) => {
    const k = 'item' + (i + 1);
    return `<div class="ev-item"><div class="t"><span>${i + 1}. ${esc(nm)}</span></div><div class="grades">${['A', 'B', 'C'].map(g =>
      `<button type="button" class="grade g-${g} ${d[k] === g ? 'on' : ''}" ${locked ? 'disabled' : ''} onclick="setGrade('${a.id}','${k}','${g}')"><b>${g}</b><small>${EV_GRADES[g]}</small></button>`).join('')}</div></div>`;
  }).join('');
  const hasC = [d.item1, d.item2, d.item3].includes('C');
  const complete = d.item1 && d.item2 && d.item3;
  let resHtml = '';
  if (t === '원장') {
    const opts = hasC ? ['불합격'] : ['합격', '보류'];
    resHtml = `<div><div class="muted small" style="margin-bottom:4px">종합 판정 ${complete ? '' : '(3개 항목 평가 후 자동 입력)'}</div><div style="display:flex;gap:6px">${complete ? opts.map(r =>
      `<button type="button" class="res-btn r-${r} ${res === r ? 'on' : ''}" ${locked ? 'disabled' : ''} onclick="setResult('${a.id}','${r}')">${r}</button>`).join('') : '<span class="muted">-</span>'}</div></div>`;
  } else {
    resHtml = `<div><div class="muted small" style="margin-bottom:4px">자동 판정</div><span class="res-btn on r-${res || '보류'}" style="${res ? '' : 'background:var(--soft);color:var(--mute);border-color:var(--line)'}">${esc(res || '-')}</span></div>`;
  }
  return `<div class="ev-card ${e.submitted ? 'done' : ''}" id="ev-${a.id}"><div class="ev-row">${avatarHtml(a, 'ev-photo')}<div class="ev-main"><h3>${o != null ? `<span class="rno">${o}번</span> ` : ''}${esc(a.name_ko)} <span class="muted small">${esc(a.name_en)} · ${esc(a.receipt_no)}</span>
    ${e.submitted ? '<span class="pill s-pass">제출 완료</span>' : '<span class="pill s-fix">작성 중</span>'}</h3>
   <div class="muted small">${esc(deptName(a.department_id))} · ${esc(a.nationality)}${a.topik_level ? ' · TOPIK ' + a.topik_level + '급' : ''}${a.high_school ? ' · ' + esc(a.high_school) : ''}${a.status !== '면접심사' ? ` · 현재 상태: ${esc(a.status)}` : ''}</div></div></div>
   <div class="ev-3">${items}</div>
   ${ref ? `<div class="ev-ref"><span>학과장 평가(참고): ${evBadge(ref)}</span><span>${ref.comment ? esc(ref.comment) : ''}</span></div>` : ''}
   <div class="ev-bottom"><textarea id="evc-${a.id}" ${locked ? 'disabled' : ''} placeholder="${t === '원장' ? '종합심사의견 (선택)' : '평가 의견 (선택)'}" oninput="S.evalDraft['${a.id}'].comment=this.value">${esc(d.comment)}</textarea>
    ${resHtml}
    ${locked ? '' : `<div style="display:flex;gap:6px"><button class="btn" onclick="saveEval('${a.id}',false)">임시저장</button><button class="btn pri" onclick="saveEval('${a.id}',true)">평가 제출</button></div>`}</div></div>`;
}
function setGrade(id, k, g) {
  const d = draftOf(id);
  d[k] = g;
  d.result = '';
  const t = myEvalType();
  const auto = autoResult(d);
  if (auto) d.result = auto;
  keepScrollRender(id);
}
function setResult(id, r) { draftOf(id).result = r; keepScrollRender(id); }
function keepScrollRender(id) {
  const y = window.scrollY;
  renderEval();
  window.scrollTo(0, y);
}
async function saveEval(id, submit) {
  const t = myEvalType(); if (!t) return;
  const d = draftOf(id);
  const ta = $('#evc-' + id); if (ta) d.comment = ta.value;
  const complete = d.item1 && d.item2 && d.item3;
  if (submit) {
    if (!complete) { toast('3개 항목을 모두 평가해야 제출할 수 있습니다.', 'err'); return; }
    const a = S.apps.find(x => x.id === id);
    const res = d.result || autoResult(d);
    if (!confirm(`${a.name_ko} 지원자의 평가를 제출합니다.\n판정: ${res}\n${t === '학과장' ? '제출 후에는 수정할 수 없습니다.' : '제출 후에도 면접심사 단계에서는 수정할 수 있습니다.'}`)) return;
  }
  const row = { item1: d.item1 || null, item2: d.item2 || null, item3: d.item3 || null, comment: d.comment.trim() || null, result: complete ? (d.result || autoResult(d)) : null };
  if (submit) { row.submitted = true; row.submitted_at = new Date().toISOString(); }
  const exist = getEv(id, t);
  let res;
  if (exist) res = await sb.from('interview_evaluations').update(row).eq('applicant_id', id).eq('evaluator_type', t).select().single();
  else res = await sb.from('interview_evaluations').insert({ applicant_id: id, evaluator_type: t, ...row }).select().single();
  if (res.error) { toast(errMsg(res.error), 'err'); return; }
  S.evals[id + '|' + t] = res.data;
  delete S.evalDraft[id];
  toast(submit ? '평가를 제출했습니다.' : '임시저장했습니다.');
  if (t === '원장') await loadAux();
  const hdr = $('.toolbar'); if (hdr) hdr.innerHTML = toolbarHtml();
  keepScrollRender(id);
}
async function cancelSubmit(id, t) {
  if (!confirm(`${t} 평가의 제출을 취소할까요? 평가자가 다시 수정할 수 있게 됩니다.`)) return;
  const { error } = await sb.from('interview_evaluations').update({ submitted: false, submitted_at: null }).eq('applicant_id', id).eq('evaluator_type', t);
  if (error) { toast(errMsg(error), 'err'); return; }
  toast('제출을 취소했습니다.');
  await loadAux(); renderShell();
}

/* ---------- 면접 순서 · 일정 (총괄관리자) ---------- */
function openOrderModal() {
  const list = S.apps.filter(a => S.interviews[a.id]).sort((x, y) => {
    const ox = orderOf(x), oy = orderOf(y);
    if (ox != null && oy != null) return ox - oy;
    if ((ox == null) !== (oy == null)) return ox == null ? 1 : -1;
    return String(x.receipt_no).localeCompare(String(y.receipt_no));
  });
  openModal(`${mHead('면접 순서 · 일정 지정', `면접심사 단계의 지원자 ${list.length}명`)}
   <div class="m-body">
    ${list.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <button class="btn sm" onclick="autoOrderFill()">접수번호 순으로 1번부터 채우기</button>
      <button class="btn sm" onclick="$$('.ord-in').forEach(i=>i.value='')">순서 모두 비우기</button>
      <span class="muted small">같은 번호가 있어도 저장됩니다. 비워 두면 “미지정”입니다.</span></div>
    <div class="tbl-wrap" style="max-height:60vh;overflow:auto"><table class="tbl" style="min-width:600px"><thead><tr><th>순서</th><th>지원자</th><th>학과</th><th>면접 일시</th></tr></thead><tbody>
    ${list.map(a => { const iv = S.interviews[a.id]; return `<tr data-id="${a.id}"><td><input class="ord-in" type="number" min="1" style="width:70px" value="${esc(iv.order_no == null ? '' : iv.order_no)}"></td>
      <td>${esc(a.name_ko)} <span class="muted small">${esc(a.receipt_no)}</span></td><td>${esc(deptName(a.department_id))}</td>
      <td><input class="dt-in" type="datetime-local" max="9999-12-31T23:59" value="${esc(toLocalInput(iv.scheduled_at))}"></td></tr>`; }).join('')}</tbody></table></div>`
    : '<div class="muted">면접심사 단계의 지원자가 없습니다. 먼저 지원자의 상태를 “면접심사”로 변경하세요.</div>'}</div>
   <div class="m-foot"><button class="btn" onclick="closeModal(this.closest('.backdrop'))">취소</button>${list.length ? '<button class="btn pri" onclick="saveOrder()">저장</button>' : ''}</div>`, { wide: true, sticky: true });
}
function autoOrderFill() { $$('.ord-in').forEach((el, i) => { el.value = i + 1; }); }
async function saveOrder() {
  const rows = $$('tr[data-id]');
  setBusy(true);
  let fail = 0;
  for (const tr of rows) {
    const id = tr.dataset.id, iv = S.interviews[id];
    const ord = $('.ord-in', tr).value, dt = $('.dt-in', tr).value;
    const newOrd = ord === '' ? null : Number(ord);
    const newDt = dt ? new Date(dt).toISOString() : null;
    const same = (iv.order_no == null ? null : iv.order_no) === newOrd && (iv.scheduled_at ? new Date(iv.scheduled_at).toISOString() : null) === newDt;
    if (same) continue;
    const { error } = await sb.from('interviews').update({ order_no: newOrd, scheduled_at: newDt }).eq('applicant_id', id);
    if (error) { fail++; toast(errMsg(error), 'err'); }
  }
  setBusy(false);
  if (!fail) toast('저장했습니다.');
  closeModal(); await loadAux(); renderShell();
}

/* ---------- 전송현황 ---------- */
function openProgress() {
  const rows = S.depts.map(d => {
    const ids = S.apps.filter(a => a.department_id === d.id && S.interviews[a.id]).map(a => a.id);
    if (!ids.length) return null;
    const c = t => ids.filter(id => { const e = getEv(id, t); return e && e.submitted; }).length;
    return { d, n: ids.length, dept: c('학과장'), dir: S.role === 'dept' ? null : c('원장') };
  }).filter(Boolean);
  openModal(`${mHead('면접전형표 전송현황', '학과별 평가 제출 현황')}
   <div class="m-body">${rows.length ? `<div class="tbl-wrap"><table class="tbl" style="min-width:480px"><thead><tr><th>학과</th><th>면접 대상</th><th>학과장 제출</th>${S.role === 'dept' ? '' : '<th>원장 제출</th>'}</tr></thead><tbody>
   ${rows.map(r => `<tr><td>${esc(r.d.name_ko)}</td><td>${r.n}명</td><td>${r.dept}/${r.n} ${r.dept === r.n ? '✔' : ''}</td>${r.dir == null ? '' : `<td>${r.dir}/${r.n} ${r.dir === r.n ? '✔' : ''}</td>`}</tr>`).join('')}</tbody></table></div>`
    : '<div class="muted">면접 대상자가 없습니다.</div>'}</div>
   <div class="m-foot"><button class="btn pri" onclick="closeModal(this.closest('.backdrop'))">닫기</button></div>`);
}

/* ---------- 면접평가표 인쇄 ---------- */
function printEvalSheet() {
  const list = evalTargets();
  if (!list.length) { toast('인쇄할 지원자가 없습니다.', 'err'); return; }
  const byDept = {};
  list.forEach(a => { (byDept[a.department_id] = byDept[a.department_id] || []).push(a); });
  const showDir = S.role !== 'dept';
  const pages = Object.keys(byDept).map(did => `<div class="doc sheet" style="height:auto;min-height:280mm">
    <h2>외국인 특별전형 면접평가표 (${esc(S.term.name)})</h2>
    <div style="margin-bottom:4mm"><b>학과:</b> ${esc(deptName(did))} &nbsp; <b>출력일:</b> ${todayYMD()}</div>
    <table><thead><tr><th>순서</th><th>사진</th><th>접수번호</th><th>성명</th><th>국적</th><th>TOPIK</th><th>${esc(EV_ITEMS[0])}</th><th>${esc(EV_ITEMS[1])}</th><th>${esc(EV_ITEMS[2])}</th><th>판정</th>${showDir ? '<th>구분</th>' : ''}</tr></thead><tbody>
    ${byDept[did].map(a => { const o = orderOf(a); const rowsEv = [['학과장', getEv(a.id, '학과장')]].concat(showDir ? [['원장', getEv(a.id, '원장')]] : []);
      return rowsEv.map(([lbl, e], i) => `<tr>${i === 0 ? `<td rowspan="${rowsEv.length}">${o == null ? '' : o}</td><td rowspan="${rowsEv.length}">${photoUrl(a) ? `<img src="${esc(photoUrl(a))}" style="width:16mm;height:21mm;object-fit:cover" alt="">` : ''}</td><td rowspan="${rowsEv.length}">${esc(a.receipt_no)}</td><td rowspan="${rowsEv.length}">${esc(a.name_ko)}<br><small>${esc(a.name_en)}</small></td><td rowspan="${rowsEv.length}">${esc(a.nationality)}</td><td rowspan="${rowsEv.length}">${a.topik_level ? a.topik_level + '급' : ''}</td>` : ''}
      <td>${e ? esc(e.item1 || '') : ''}</td><td>${e ? esc(e.item2 || '') : ''}</td><td>${e ? esc(e.item3 || '') : ''}</td><td>${e ? esc(e.result || '') : ''}</td>${showDir ? `<td>${lbl}</td>` : ''}</tr>`).join(''); }).join('')}
    </tbody></table>
    <div style="margin-top:6mm;font-size:9pt">A: 우수(탁월) · B: 보통(적격) · C: 미흡(불합격) — C가 하나라도 있으면 불합격</div>
    <div style="margin-top:14mm;text-align:right">평가자 서명: ____________________</div></div>`).join('');
  printHtml(pages);
}
