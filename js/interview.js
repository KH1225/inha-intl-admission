'use strict';
/* ===== 면접 평가 (국제교류원장 / 학과장), 면접 순서, 전송현황 ===== */
const EV_ITEMS = ['전공적합성 및 학업의지', '발표력/표현력 및 인성', '한국어 구사능력/의사소통'];
const EV_GRADES = { A: '우수(탁월)', B: '보통(적격)', C: '미흡(불합격)' };

const getEv = (id, t) => S.evals[id + '|' + t] || null;

/* ---------- 면접위원 배정 (면접 순서로 나눠 평가) ----------
   평가는 지원자마다 '학과장' 쪽 1건 + '원장' 쪽 1건 그대로입니다.
   어떤 학과에 배정이 있으면 그 쪽은 면접 순서 범위에 배정된 사람만 평가합니다.
   배정이 없는 학과·쪽은 예전처럼 학과장(소속 학과 전원) / 국제교류원장(전 학과)이 평가합니다. */
const panelsFor = (did, t) => (S.panels || []).filter(p => String(p.department_id) === String(did) && p.evaluator_type === t)
  .sort((x, y) => x.order_from - y.order_from);
const isSplit = (a, t) => panelsFor(a.department_id, t).length > 0;
function panelOf(a, t) {
  const o = orderOf(a);
  return o == null ? null : panelsFor(a.department_id, t).find(p => o >= p.order_from && o <= p.order_to) || null;
}
const myPanels = () => (S.panels || []).filter(p => S.user && p.profile_id === S.user.id);
/* 내가 평가자로 참여하는 쪽 (없으면 null) */
const myEvalType = () => (S.role === 'director' ? '원장' : S.role === 'dept' ? '학과장'
  : myPanels().some(p => p.evaluator_type === '원장') ? '원장' : null);
/* 이 지원자를 내가 평가하는지 → '원장' / '학과장' / null */
function myTypeFor(a) {
  const t = myEvalType();
  if (!t || !a) return null;
  if (t === '학과장' && String(a.department_id) !== String(S.profile.department_id)) return null;
  if (!isSplit(a, t)) return (S.role === 'director' || S.role === 'dept') ? t : null;
  const p = panelOf(a, t);
  return p && p.profile_id === S.user.id ? t : null;
}
/* 화면·출력물에 쓰는 평가자 표시 */
function whoName(a, t) {
  const e = getEv(a.id, t);
  if (e && e.evaluator_name) return e.evaluator_name;
  const p = panelOf(a, t);
  return p ? p.evaluator_name || '' : '';
}
function whoLabel(a, t) {
  if (!isSplit(a, t)) return t === '원장' ? '국제교류원장' : '학과장';
  const n = whoName(a, t);
  return n ? `면접위원 ${n}` : '면접위원 미배정';
}
function draftOf(id) {
  const t = myTypeFor(S.apps.find(x => x.id === id)) || myEvalType();
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

function evalTargets(allStatus) {
  let list = S.apps.filter(a => S.interviews[a.id] || a.status === '면접심사');
  // 학과장·학과 면접위원은 자기가 맡은 지원자만 봅니다
  if (S.role === 'dept') list = list.filter(a => myTypeFor(a));
  if (S.evalFilter.dept) list = list.filter(a => String(a.department_id) === String(S.evalFilter.dept));
  if (!allStatus && S.evalFilter.pending && myEvalType()) {
    list = list.filter(a => { const t = myTypeFor(a); return t && !(getEv(a.id, t) && getEv(a.id, t).submitted); });
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
    ? (S.role === 'director' ? '국제교류원장으로서 전 학과 지원자를 평가합니다. 학과장 평가는 참고용으로 표시됩니다.'
      : '국제교류원 면접위원으로 배정된 지원자를 평가합니다. 나머지 지원자는 조회만 됩니다. 학과 평가는 참고용으로 표시됩니다.')
    : t === '학과장'
      ? '내가 맡은 지원자만 표시됩니다. 제출하면 수정할 수 없으니 확인 후 제출하세요.'
      : (can.admin() ? '면접 순서와 면접위원을 지정하고 평가 진행 상황을 확인할 수 있습니다. (평가 입력은 원장·학과장·배정된 면접위원만 가능)' : '평가 진행 상황을 조회합니다.');
  const mine = myPanels();
  const unsigned = t ? unsignedEvals(t) : [];
  $('#main').innerHTML = `
  <div class="notice">${esc(intro)}</div>
  ${mine.length ? `<div class="notice" style="margin-top:8px">내 면접 담당: ${mine.map(p => `<b>${esc(deptName(p.department_id))} ${p.order_from}~${p.order_to}번</b> (${p.evaluator_type === '원장' ? '국제교류원' : '학과'})`).join(', ')}</div>` : ''}
  ${unsigned.length ? `<div class="warn" style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">제출했지만 서명이 없는 평가가 <b>${unsigned.length}건</b> 있습니다. 서명해야 인쇄한 면접평가표에 서명이 나옵니다.
    <button class="btn pri sm" onclick="openSignPad(null)">한 번에 서명하기</button></div>` : ''}
  <div class="filters" style="margin:10px 0">
    ${depts.length ? `<select onchange="S.evalFilter.dept=this.value;renderEval()"><option value="">전체 학과</option>${depts.map(d => `<option value="${d.id}" ${String(S.evalFilter.dept) === String(d.id) ? 'selected' : ''}>${esc(d.name_ko)}</option>`).join('')}</select>` : ''}
    ${t ? `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" ${S.evalFilter.pending ? 'checked' : ''} onchange="S.evalFilter.pending=this.checked;renderEval()"> 미제출만 보기</label>` : ''}
    <span class="sp"></span>
    ${can.admin() ? `<button class="btn" onclick="openOrderModal()">면접 순서 · 일정 지정</button><button class="btn" onclick="openPanelModal()">면접위원 배정</button>` : ''}
    ${can.edit() ? `<button class="btn blue" onclick="openMailModal('면접안내')">면접 안내 메일</button>` : ''}
    <button class="btn" onclick="printEvalSheet()">면접평가표 인쇄</button></div>
  ${evalStatsHtml()}
  ${list.length ? `<div class="ev-list">${list.map(a => { const mt = myTypeFor(a); return mt ? evalCardEdit(a, mt) : evalCardView(a); }).join('')}</div>${evalBatchBar()}`
    : '<div class="center-msg"><div><h2>평가할 지원자가 없습니다</h2><p>면접심사 단계로 변경된 지원자가 여기에 표시됩니다.</p></div></div>'}`;
  evStartPoll();
}

function evBadge(e) {
  if (!e) return '<span class="muted">미작성</span>';
  return `${[e.item1, e.item2, e.item3].map(x => x || '-').join(' / ')} → <b>${esc(e.result || '-')}</b>${e.submitted ? ' (제출됨)' : ' (임시저장)'}`;
}
/* 편입학 지원자: 편입 학년과 협약학교 표시 */
const partnerName = a => (a && a.partner_school_id && S.partnerMap && S.partnerMap[a.partner_school_id] ? S.partnerMap[a.partner_school_id].name : '');
/* 학교 목록을 못 읽는 권한이어도 협약 여부는 지원자 정보로 판단 */
const isPartner = a => !!(a && (a.partner_school_id || a.route === ROUTE_PARTNER));
function transferBadges(a) {
  if (a.admission_kind !== '편입학') return '';
  const ps = partnerName(a), isP = isPartner(a);
  return ` <span class="badge kind tr">편입학${a.transfer_year ? ' ' + esc(a.transfer_year) + '학년' : ''}</span>`
    + ` <span class="badge kind ${isP ? 'tr' : ''}">${isP ? '협약학교' + (ps ? ' · ' + esc(ps) : '') : '협약학교 아님'}</span>`;
}
/* 면접 일시: 11월 28일(금) 14:30 */
function ivWhen(a) {
  const v = (S.interviews[a.id] || {}).scheduled_at;
  const d = v ? new Date(v) : null;
  if (!d || isNaN(d)) return '<span class="ev-when none">면접일시 미정</span>';
  const p = n => String(n).padStart(2, '0');
  return `<span class="ev-when">🗓 ${d.getMonth() + 1}월 ${d.getDate()}일(${'일월화수목금토'[d.getDay()]}) ${p(d.getHours())}:${p(d.getMinutes())}</span>`;
}
function evalCardView(a) {
  const e1 = getEv(a.id, '원장'), e2 = getEv(a.id, '학과장'), o = orderOf(a);
  const done = e1 && e1.submitted;
  return `<div class="ev-card ${done ? 'done' : ''}"><div class="ev-row">${avatarHtml(a, 'ev-photo')}<div class="ev-main"><h3>${o != null ? `<span class="rno">${o}번</span> ` : ''}${esc(a.name_ko)} <span class="muted small">${esc(a.name_en)} · ${esc(a.receipt_no)}</span>${transferBadges(a)} <span class="pill ${STATUS_CLS[a.status]}">${esc(a.status)}</span></h3>
   <div class="muted small">${esc(deptName(a.department_id))} · ${esc(a.nationality)}${langLabel(a) ? ' · ' + langLabel(a) : ''} ${ivWhen(a)}</div>
   
   <div class="kv" style="margin-top:8px"><div><span>${esc(whoLabel(a, '원장'))}</span><b>${evBadge(e1)} ${e1 && e1.submitted ? signImg(e1, '22px') : ''}</b></div><div><span>${esc(whoLabel(a, '학과장'))}</span><b>${evBadge(e2)} ${e2 && e2.submitted ? signImg(e2, '22px') : ''}</b></div></div>
   ${e1 && e1.comment ? `<div class="muted small" style="margin-top:6px">${isSplit(a, '원장') ? '국제교류원' : '원장'} 의견: ${esc(e1.comment)}</div>` : ''}
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
  // 판정: C가 있으면 불합격, 없으면 합격/보류 중 선택 (학과 쪽·국제교류원 쪽 동일)
  const opts = hasC ? ['불합격'] : ['합격', '보류'];
  const resHtml = `<div><div class="muted small" style="margin-bottom:4px">${t === '원장' ? '종합 판정' : '판정'} ${complete ? '' : '(3개 항목 평가 후 선택)'}</div><div style="display:flex;gap:6px">${complete ? opts.map(r =>
      `<button type="button" class="res-btn r-${r} ${res === r ? 'on' : ''}" ${locked ? 'disabled' : ''} onclick="setResult('${a.id}','${r}')">${r}</button>`).join('') : '<span class="muted">-</span>'}</div></div>`;
  return `<div class="ev-card ${e.submitted ? 'done' : ''}" id="ev-${a.id}"><div class="ev-row">${avatarHtml(a, 'ev-photo')}<div class="ev-main"><h3>${o != null ? `<span class="rno">${o}번</span> ` : ''}${esc(a.name_ko)} <span class="muted small">${esc(a.name_en)} · ${esc(a.receipt_no)}</span>${transferBadges(a)}
    ${e.submitted ? '<span class="pill s-pass">제출 완료</span>' : '<span class="pill s-fix">작성 중</span>'}${e.submitted && signImg(e, '26px') ? ` <span class="sign-mini">${signImg(e, '26px')}</span>` : ''}</h3>
   <div class="muted small">${esc(deptName(a.department_id))} · ${esc(a.nationality)}${langLabel(a) ? ' · ' + langLabel(a) : ''}${a.high_school ? ' · ' + esc(a.high_school) : ''}${a.prev_university ? ' · ' + esc(a.prev_university) : ''}${a.status !== '면접심사' ? ` · 현재 상태: ${esc(a.status)}` : ''} ${ivWhen(a)}</div></div></div>
   <div class="ev-3">${items}</div>
   ${ref ? `<div class="ev-ref"><span>${esc(whoLabel(a, '학과장'))} 평가(참고): ${evBadge(ref)}</span><span>${ref.comment ? esc(ref.comment) : ''}</span></div>` : ''}
   <div class="ev-bottom"><textarea id="evc-${a.id}" ${locked ? 'disabled' : ''} placeholder="${t === '원장' ? '종합심사의견 (선택)' : '평가 의견 (선택)'}" oninput="S.evalDraft['${a.id}'].comment=this.value;evTouch('${a.id}')">${esc(d.comment)}</textarea>
    ${resHtml}
    ${locked ? '' : `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="muted small ev-saved">${evSavedText(a.id)}</span><button class="btn" onclick="saveEval('${a.id}',false)">지금 저장</button><button class="btn pri" onclick="saveEval('${a.id}',true)">평가 제출</button></div>`}</div></div>`;
}
function setGrade(id, k, g) {
  const d = draftOf(id);
  d[k] = g;
  d.result = '';
  const auto = autoResult(d);
  if (auto) d.result = auto;
  evTouch(id);
  keepScrollRender(id);
}
function setResult(id, r) { draftOf(id).result = r; evTouch(id); keepScrollRender(id); }
function keepScrollRender(id) {
  const y = window.scrollY;
  renderEval();
  window.scrollTo(0, y);
}
async function saveEval(id, submit, signature) {
  const t = myTypeFor(S.apps.find(x => x.id === id)); if (!t) { toast('이 지원자는 내가 맡은 평가 대상이 아닙니다.', 'err'); return false; }
  const d = draftOf(id);
  const ta = $('#evc-' + id); if (ta) d.comment = ta.value;
  const complete = d.item1 && d.item2 && d.item3;
  if (submit) {
    if (!complete) { toast('3개 항목을 모두 평가해야 제출할 수 있습니다.', 'err'); return; }
    if (!signature) { openSignPad(id); return; }
  }
  await evFlushAuto();
  const err = await writeEval(id, t, d, submit, signature);
  if (err) { toast(err, 'err'); return false; }
  toast(submit ? '평가를 제출했습니다.' : '임시저장했습니다.');
  if (t === '원장') await loadAux();
  const hdr = $('.toolbar'); if (hdr) hdr.innerHTML = toolbarHtml();
  keepScrollRender(id);
  return true;
}
/* 평가 1건 저장 (화면 갱신 없음). 실패하면 오류 문구, 성공하면 '' */
async function writeEval(id, t, d, submit, signature, keepDraft) {
  const complete = d.item1 && d.item2 && d.item3;
  const row = { item1: d.item1 || null, item2: d.item2 || null, item3: d.item3 || null, comment: (d.comment || '').trim() || null, result: complete ? (d.result || autoResult(d)) : null };
  if (submit) { row.submitted = true; row.submitted_at = new Date().toISOString(); if (signature) row.signature = signature; }
  // 누가 평가했는지 기록 (면접위원 배정 SQL을 적용한 뒤부터)
  if (S.panelReady) { row.evaluator_id = S.user.id; row.evaluator_name = S.profile.display_name || null; }
  const exist = getEv(id, t);
  let res;
  if (exist) res = await sb.from('interview_evaluations').update(row).eq('applicant_id', id).eq('evaluator_type', t).select().single();
  else res = await sb.from('interview_evaluations').insert({ applicant_id: id, evaluator_type: t, ...row }).select().single();
  if (res.error) return /signature/.test(errMsg(res.error)) ? '서명 저장 칸이 DB에 아직 없습니다. 관리자에게 SQL 적용을 요청하세요.' : errMsg(res.error);
  S.evals[id + '|' + t] = res.data;
  if (!keepDraft) delete S.evalDraft[id];
  return '';
}

/* ---------- 한꺼번에 저장 · 제출 ----------
   화면에 보이는 내 평가 중 아직 제출하지 않은 것을 모아 한 번에 임시저장하거나,
   3개 항목을 다 입력한 것을 서명 한 번으로 모두 제출합니다. */
function openEvalCards() {
  return evalTargets().filter(a => {
    const t = myTypeFor(a); if (!t || a.status !== '면접심사') return false;
    const e = getEv(a.id, t); return !(e && e.submitted);
  });
}
const draftDone = id => { const d = draftOf(id); return !!(d.item1 && d.item2 && d.item3); };
function syncEvalComments() {
  openEvalCards().forEach(a => { const ta = $('#evc-' + a.id); if (ta) draftOf(a.id).comment = ta.value; });
}
function evalBatchBar() {
  const open = openEvalCards(); if (!open.length) return '';
  const ready = open.filter(a => draftDone(a.id)).length;
  return `<div class="ev-batch"><div><b>미제출 ${open.length}명</b> <span class="muted small">· 3개 항목 입력 완료 ${ready}명${ready < open.length ? ` · 미완료 ${open.length - ready}명` : ''}</span></div>
   <span class="sp"></span>
   <button class="btn" onclick="saveAllEvals()">전체 임시저장</button>
   <button class="btn pri" ${ready ? '' : 'disabled'} onclick="openSignPad('*')">한 번에 서명하고 제출 (${ready}명)</button></div>`;
}
async function saveAllEvals() {
  syncEvalComments();
  await evFlushAuto();
  // 입력한 내용이 있는 카드만 저장 (아무것도 안 건드린 카드는 건너뜀)
  const list = openEvalCards().filter(a => {
    const d = S.evalDraft[a.id]; if (!d) return false;
    const e = getEv(a.id, myTypeFor(a)) || {};
    return ['item1', 'item2', 'item3', 'comment', 'result'].some(k => (d[k] || '') !== (e[k] || ''));
  });
  if (!list.length) { toast('새로 저장할 내용이 없습니다.'); return; }
  setBusy(true);
  let n = 0, err = '', dir = false;
  for (const a of list) {
    const t = myTypeFor(a);
    err = await writeEval(a.id, t, draftOf(a.id), false);
    if (err) { err = `${a.name_ko}: ${err}`; break; }
    n++; if (t === '원장') dir = true;
  }
  if (dir) await loadAux();
  setBusy(false);
  toast(err ? `${err}${n ? ` (${n}명은 저장됨)` : ''}` : `${n}명 임시저장했습니다.`, err ? 'err' : 'ok');
  keepScrollRender();
}
async function submitAllEvals(url) {
  await evFlushAuto();
  const list = openEvalCards().filter(a => draftDone(a.id));
  let n = 0, err = '', dir = false;
  for (const a of list) {
    const t = myTypeFor(a);
    err = await writeEval(a.id, t, draftOf(a.id), true, url);
    if (err) { err = `${a.name_ko}: ${err}`; break; }
    n++; if (t === '원장') dir = true;
  }
  if (dir) await loadAux();
  const hdr = $('.toolbar'); if (hdr) hdr.innerHTML = toolbarHtml();
  toast(err ? `${err}${n ? ` (${n}명은 제출됨)` : ''}` : `${n}명 평가를 제출했습니다.`, err ? 'err' : 'ok');
  keepScrollRender();
  return !err;
}

/* ---------- 학과장 서명 ---------- */
/* 서명 기억 기능은 사용하지 않습니다 (공용 PC에서 다른 사람이 서명을 재사용할 수 없도록 매번 직접 서명).
   예전에 브라우저에 기억해 둔 서명은 지웁니다. */
function lastSign() { return ''; }
function clearSavedSigns() {
  try { Object.keys(localStorage).filter(k => k.startsWith('lastSign:')).forEach(k => localStorage.removeItem(k)); } catch (e) { /* 무시 */ }
}
clearSavedSigns();
/* 이미 제출했지만 서명이 없는 내 평가 (서명 기능 이전에 제출한 것) */
function unsignedEvals(t) {
  const byId = Object.fromEntries(S.apps.map(a => [a.id, a]));
  return Object.values(S.evals).filter(e => e.evaluator_type === t && e.submitted && !e.signature && byId[e.applicant_id]
    && (e.evaluator_id ? e.evaluator_id === S.user.id : myTypeFor(byId[e.applicant_id]) === t));
}
function openSignPad(id) {
  const prev = lastSign();
  const batch = id === '*'; if (batch) { syncEvalComments(); id = null; }
  const t = id ? myTypeFor(S.apps.find(x => x.id === id)) : myEvalType();
  const split = id ? isSplit(S.apps.find(x => x.id === id), t) : myPanels().length > 0;
  const who = split ? `면접위원 ${S.profile.display_name || ''}` : (t === '원장' ? '국제교류원장' : '학과장');
  let head, info, warn, okLabel;
  if (id) {
    const a = S.apps.find(x => x.id === id), d = draftOf(id);
    const res = d.result || autoResult(d);
    head = mHead(`평가 제출 · ${who} 서명`, `${esc(a.name_ko)} · ${esc(a.receipt_no)}`);
    info = `<div class="kv" style="margin-bottom:10px">${EV_ITEMS.map((nm, i) => `<div><span>${esc(nm)}</span><b>${esc(d['item' + (i + 1)])} ${esc(EV_GRADES[d['item' + (i + 1)]] || '')}</b></div>`).join('')}<div><span>판정</span><b>${esc(res)}</b></div></div>`;
    warn = t === '원장' && S.role === 'director' ? '제출 후에도 면접심사 단계에서는 수정할 수 있으며, 다시 제출할 때 새로 서명합니다.' : '제출 후에는 수정할 수 없습니다.';
    okLabel = '서명하고 제출';
  } else if (batch) {
    const open = openEvalCards(), ready = open.filter(a => draftDone(a.id)), skip = open.length - ready.length;
    if (!ready.length) { toast('3개 항목을 모두 입력한 평가가 없습니다.', 'err'); return; }
    head = mHead(`평가 ${ready.length}명 한 번에 제출 · ${who} 서명`, '아래 내용을 확인한 뒤 서명하세요');
    info = `<div class="tbl-wrap" style="margin-bottom:10px;max-height:300px;overflow:auto"><table class="tbl"><thead><tr><th>순서</th><th>성명</th><th>학과</th>${EV_ITEMS.map((_, i) => `<th>${i + 1}</th>`).join('')}<th>판정</th></tr></thead><tbody>${ready.map(a => {
      const d = draftOf(a.id), o = orderOf(a);
      return `<tr><td>${o == null ? '' : o + '번'}</td><td>${esc(a.name_ko)}</td><td>${esc(deptName(a.department_id))}</td>${[d.item1, d.item2, d.item3].map(g => `<td><b>${esc(g)}</b></td>`).join('')}<td><b>${esc(d.result || autoResult(d))}</b></td></tr>`; }).join('')}</tbody></table></div>
      ${skip ? `<div class="notice small" style="margin-bottom:10px">3개 항목을 다 입력하지 않은 ${skip}명은 이번 제출에서 빠집니다.</div>` : ''}`;
    warn = `서명 한 번으로 위 ${ready.length}명의 평가가 모두 제출됩니다. ${t === '원장' && S.role === 'director' ? '제출 후에도 면접심사 단계에서는 총괄관리자가 제출을 취소해 수정할 수 있습니다.' : '제출 후에는 수정할 수 없습니다.'}`;
    okLabel = `서명하고 ${ready.length}명 제출`;
  } else {
    const list = unsignedEvals(t);
    head = mHead(`${who} 서명 · 제출한 평가 ${list.length}건`, '이미 제출한 평가에 서명만 추가합니다 (평가 내용은 바뀌지 않습니다)');
    info = `<div class="kv" style="margin-bottom:10px">${list.map(e => { const a = S.apps.find(x => x.id === e.applicant_id) || {};
      return `<div><span>${esc(a.receipt_no || '')} · ${esc(deptName(a.department_id))}</span><b>${esc(a.name_ko || '')} — ${esc(e.result || '')}</b></div>`; }).join('')}</div>`;
    warn = '서명 한 번으로 위 평가 모두에 같은 서명이 들어갑니다.';
    okLabel = `${list.length}건에 서명`;
  }
  const bd = openModal(`${head}
   <div class="m-body">
    ${info}
    <div class="warn">아래 칸에 마우스나 손가락으로 서명하세요. ${warn}</div>
    <div class="sign-wrap"><canvas id="sign-pad"></canvas><div class="sign-hint" id="sign-hint">여기에 서명</div></div>
    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn sm" onclick="clearSignPad()">지우기</button>
     ${prev ? `<button class="btn sm" onclick="useLastSign()">지난번 서명 사용</button>` : ''}</div></div>
   <div class="m-foot"><button class="btn" onclick="closeModal(this.closest('.backdrop'))">취소</button>
    <button class="btn pri" id="sign-ok" onclick="submitSigned(${batch ? `'*'` : id ? `'${id}'` : 'null'})">${okLabel}</button></div>`, { sticky: true });
  initSignPad($('#sign-pad', bd));
}
function initSignPad(cv) {
  const ratio = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * ratio; cv.height = h * ratio;
  const ctx = cv.getContext('2d');
  ctx.scale(ratio, ratio); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
  cv._signed = false;
  let drawing = false, lx = 0, ly = 0;
  const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', e => { drawing = true; [lx, ly] = pos(e); cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.arc(lx, ly, 1.1, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill(); markSigned(cv); });
  cv.addEventListener('pointermove', e => { if (!drawing) return; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(x, y); ctx.stroke(); lx = x; ly = y; });
  const end = () => { drawing = false; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end); cv.addEventListener('pointerleave', end);
}
function markSigned(cv) { cv._signed = true; const h = $('#sign-hint'); if (h) h.style.display = 'none'; }
function clearSignPad() {
  const cv = $('#sign-pad'); if (!cv) return;
  cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); cv._signed = false;
  const h = $('#sign-hint'); if (h) h.style.display = '';
}
function useLastSign() {
  const cv = $('#sign-pad'), src = lastSign(); if (!cv || !src) return;
  const im = new Image();
  im.onload = () => {
    clearSignPad();
    const ctx = cv.getContext('2d'), w = cv.clientWidth, h = cv.clientHeight, s = Math.min(w / im.width, h / im.height);
    ctx.drawImage(im, (w - im.width * s) / 2, (h - im.height * s) / 2, im.width * s, im.height * s);
    markSigned(cv);
  };
  im.src = src;
}
/* 서명 둘레의 빈 공간을 잘라 작은 PNG로 만듭니다 */
function signDataUrl(cv) {
  const ctx = cv.getContext('2d'), { width: W, height: H } = cv, px = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[(y * W + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return '';
  const pad = 6; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const sw = x1 - x0 + 1, sh = y1 - y0 + 1, k = Math.min(1, 400 / sw, 150 / sh);
  const out = document.createElement('canvas'); out.width = Math.round(sw * k); out.height = Math.round(sh * k);
  out.getContext('2d').drawImage(cv, x0, y0, sw, sh, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
async function signSubmitted(url) {
  const t = myEvalType(), list = unsignedEvals(t);
  let n = 0;
  for (const e of list) {
    const { data, error } = await sb.from('interview_evaluations').update({ signature: url })
      .eq('applicant_id', e.applicant_id).eq('evaluator_type', t).select().single();
    if (error) { toast((/signature/.test(errMsg(error)) ? '서명 저장 칸이 DB에 아직 없습니다. 관리자에게 SQL 적용을 요청하세요.' : errMsg(error)) + (n ? ` (${n}건은 서명됨)` : ''), 'err'); if (n) renderEval(); return false; }
    S.evals[e.applicant_id + '|' + t] = data; n++;
  }
  toast(`${n}건에 서명했습니다.`);
  renderEval();
  return true;
}
async function submitSigned(id) {
  const cv = $('#sign-pad');
  const url = cv && cv._signed ? signDataUrl(cv) : '';
  if (!url) { toast('서명을 해야 제출할 수 있습니다.', 'err'); return; }
  const btn = $('#sign-ok'); btn.disabled = true;
  const ok = id === '*' ? await submitAllEvals(url) : id ? await saveEval(id, true, url) : await signSubmitted(url);
  if (!ok) { btn.disabled = false; return; }
  closeModal(cv.closest('.backdrop'));
}
const signImg = (e, h) => (e && e.signature && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(e.signature) ? `<img src="${e.signature}" alt="서명" style="height:${h};vertical-align:middle">` : '');

async function cancelSubmit(id, t) {
  if (!confirm(`${t} 평가의 제출을 취소할까요? 평가자가 다시 수정할 수 있게 됩니다.`)) return;
  const { error } = await sb.from('interview_evaluations').update({ submitted: false, submitted_at: null, signature: null }).eq('applicant_id', id).eq('evaluator_type', t);
  if (error) { toast(errMsg(error), 'err'); return; }
  toast('제출을 취소했습니다.');
  await loadAux(); renderShell();
}

/* ---------- 면접 순서 · 일정 (총괄관리자) ---------- */
let orderDept = '';
function openOrderModal() {
  const list = S.apps.filter(a => S.interviews[a.id]).sort((x, y) => {
    const dx = deptName(x.department_id), dy = deptName(y.department_id);
    if (dx !== dy) return dx.localeCompare(dy, 'ko');
    const ox = orderOf(x), oy = orderOf(y);
    if (ox != null && oy != null && ox !== oy) return ox - oy;
    if ((ox == null) !== (oy == null)) return ox == null ? 1 : -1;
    return String(x.receipt_no).localeCompare(String(y.receipt_no));
  });
  const depts = [...new Set(list.map(a => a.department_id))].map(id => ({ id: String(id), name: deptName(id), n: list.filter(a => a.department_id === id).length }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  if (orderDept && !depts.some(d => d.id === orderDept)) orderDept = '';
  if (!orderDept && depts.length === 1) orderDept = depts[0].id;
  openModal(`${mHead('면접 순서 · 일정 지정', `면접심사 단계의 지원자 ${list.length}명 · 학과별로 순서와 일시를 정합니다`)}
   <div class="m-body">
    ${list.length ? `<div class="ord-bar">
      <label class="fld" style="min-width:220px"><span>학과 선택</span><select id="ord-dept" onchange="orderDept=this.value;orderFilter()">
        <option value="">전체 학과 (${list.length}명)</option>${depts.map(d => `<option value="${d.id}" ${orderDept === d.id ? 'selected' : ''}>${esc(d.name)} (${d.n}명)</option>`).join('')}</select></label>
      <div class="ord-tools">
       <button class="btn sm" onclick="autoOrderFill()">접수번호 순으로 1번부터 채우기</button>
       <button class="btn sm" onclick="orderRows().forEach(tr=>{$('.ord-in',tr).value=''})">순서 비우기</button>
       <span class="muted small" id="ord-hint"></span></div>
      <div class="ord-time" id="ord-time">
       <label class="fld"><span>첫 면접 시작</span><input id="ord-start" type="datetime-local" max="9999-12-31T23:59"></label>
       <label class="fld"><span>간격(분)</span><input id="ord-gap" type="number" min="1" value="10" style="width:80px"></label>
       <button class="btn sm blue" onclick="autoTimeFill()">순서대로 시간 채우기</button></div></div>
    <div class="tbl-wrap" style="max-height:55vh;overflow:auto"><table class="tbl" style="min-width:600px"><thead><tr><th>순서</th><th>지원자</th><th class="ord-dcol">학과</th><th>면접 일시</th></tr></thead><tbody>
    ${list.map(a => { const iv = S.interviews[a.id]; return `<tr data-id="${a.id}" data-dept="${a.department_id}" data-rno="${esc(a.receipt_no)}"><td><input class="ord-in" type="number" min="1" style="width:70px" value="${esc(iv.order_no == null ? '' : iv.order_no)}"></td>
      <td>${esc(a.name_ko)} <span class="muted small">${esc(a.receipt_no)}</span></td><td class="ord-dcol">${esc(deptName(a.department_id))}</td>
      <td><input class="dt-in" type="datetime-local" max="9999-12-31T23:59" value="${esc(toLocalInput(iv.scheduled_at))}"></td></tr>`; }).join('')}</tbody></table></div>`
    : '<div class="muted">면접심사 단계의 지원자가 없습니다. 먼저 지원자의 상태를 “면접심사”로 변경하세요.</div>'}</div>
   <div class="m-foot"><span class="muted small" style="margin-right:auto">다른 학과에서 고친 내용도 함께 저장됩니다.</span><button class="btn" onclick="closeModal(this.closest('.backdrop'))">취소</button>${list.length ? '<button class="btn pri" onclick="saveOrder()">저장</button>' : ''}</div>`, { wide: true, sticky: true });
  if (list.length) orderFilter();
}
/* 지금 보이는(선택한 학과) 줄 */
function orderRows() { return $$('tr[data-id]').filter(tr => !orderDept || tr.dataset.dept === orderDept); }
function orderFilter() {
  $$('tr[data-id]').forEach(tr => { tr.style.display = !orderDept || tr.dataset.dept === orderDept ? '' : 'none'; });
  $$('.ord-dcol').forEach(el => { el.style.display = orderDept ? 'none' : ''; });
  $('#ord-time').classList.toggle('hide', !orderDept);
  $('#ord-hint').textContent = orderDept ? '이 학과 지원자만 바뀝니다. 같은 번호가 있어도 저장되며, 비워 두면 “미지정”입니다.'
    : '전체 학과에서는 학과마다 1번부터 따로 매깁니다. 시간 채우기는 학과를 고르면 나타납니다.';
}
function autoOrderFill() {
  const groups = {};
  orderRows().forEach(tr => { (groups[tr.dataset.dept] = groups[tr.dataset.dept] || []).push(tr); });
  Object.values(groups).forEach(g => g.sort((a, b) => a.dataset.rno.localeCompare(b.dataset.rno)).forEach((tr, i) => { $('.ord-in', tr).value = i + 1; }));
}
function autoTimeFill() {
  const start = $('#ord-start').value, gap = Number($('#ord-gap').value);
  if (!start) { toast('첫 면접 시작 일시를 입력하세요.', 'err'); return; }
  if (!(gap > 0)) { toast('간격(분)을 입력하세요.', 'err'); return; }
  const rows = orderRows().slice().sort((a, b) => {
    const oa = $('.ord-in', a).value, ob = $('.ord-in', b).value;
    if (oa !== '' && ob !== '' && Number(oa) !== Number(ob)) return Number(oa) - Number(ob);
    if ((oa === '') !== (ob === '')) return oa === '' ? 1 : -1;
    return a.dataset.rno.localeCompare(b.dataset.rno);
  });
  const t0 = new Date(start).getTime();
  rows.forEach((tr, i) => { $('.dt-in', tr).value = toLocalInput(new Date(t0 + i * gap * 60000).toISOString()); });
  toast(`${rows.length}명의 면접 시간을 ${gap}분 간격으로 채웠습니다. “저장”을 눌러야 반영됩니다.`);
}
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
    : '<div class="muted">면접 대상자가 없습니다.</div>'}
   ${panelProgressHtml()}</div>
   <div class="m-foot"><button class="btn pri" onclick="closeModal(this.closest('.backdrop'))">닫기</button></div>`);
}
/* 면접위원을 배정한 학과는 위원별 제출 현황도 보여 줍니다 */
function panelProgressHtml() {
  const sides = S.role === 'dept' ? ['학과장'] : ['학과장', '원장'];
  const rows = [];
  S.depts.forEach(d => sides.forEach(t => panelsFor(d.id, t).forEach(p => {
    if (S.role === 'dept' && String(d.id) !== String(S.profile.department_id)) return;
    const apps = S.apps.filter(a => a.department_id === d.id && S.interviews[a.id] && panelOf(a, t) === p);
    const done = apps.filter(a => { const e = getEv(a.id, t); return e && e.submitted; }).length;
    rows.push(`<tr><td>${esc(d.name_ko)}</td><td>${t === '원장' ? '국제교류원' : '학과'}</td><td>${esc(p.evaluator_name || '')}</td><td>${p.order_from}~${p.order_to}번</td><td>${done}/${apps.length} ${apps.length && done === apps.length ? '✔' : ''}</td></tr>`);
  })));
  if (!rows.length) return '';
  return `<h3 style="margin:16px 0 8px">면접위원별 제출 현황</h3><div class="tbl-wrap"><table class="tbl" style="min-width:480px"><thead><tr><th>학과</th><th>구분</th><th>면접위원</th><th>담당 순서</th><th>제출</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

/* ---------- 면접평가표 인쇄 ---------- */
function printEvalSheet() { const list = evalTargets(); if (!list.length) { toast('인쇄할 지원자가 없습니다.', 'err'); return; } printHtml(evalSheetHtml(list), { mark: true }); if (typeof logAccess === 'function') logAccess('면접평가표 인쇄', list.map(a => a.id)); }
function evalSheetHtml(list) {
  const showDir = S.role !== 'dept';
  // 학과별로 나누고, 학과 면접위원이 배정된 학과는 면접위원마다 따로 한 장씩
  const groups = [], gmap = {};
  list.forEach(a => {
    const split = isSplit(a, '학과장'), p = split ? panelOf(a, '학과장') : null;
    const k = a.department_id + '|' + (split ? (p ? p.id : 'none') : '');
    if (!gmap[k]) { gmap[k] = { did: a.department_id, split, p, apps: [] }; groups.push(gmap[k]); }
    gmap[k].apps.push(a);
  });
  groups.sort((x, y) => deptName(x.did).localeCompare(deptName(y.did), 'ko') || ((x.p ? x.p.order_from : 1e9) - (y.p ? y.p.order_from : 1e9)));
  const signLine = (label, e) => `<div class="ev-sign"><span>${esc(label)}</span><span class="ln">${e ? signImg(e, '15mm') : ''}</span><span>(서명)</span></div>`;
  const pages = groups.map(g => {
    const did = g.did;
    const rows = g.apps.map(a => {
      const o = orderOf(a);
      const rowsEv = [['학과장', getEv(a.id, '학과장')]].concat(showDir ? [['원장', getEv(a.id, '원장')]] : []);
      const rs = `rowspan="${rowsEv.length}"`;
      return rowsEv.map(([t, e], i) => `<tr>${i === 0 ? `<td ${rs} class="nw">${o == null ? '' : o}</td><td ${rs} class="nw">${esc(a.receipt_no)}<br><span class="kind ${a.admission_kind === '편입학' ? 'tr' : ''}">${esc(a.admission_kind || '')}${a.admission_kind === '편입학' && a.transfer_year ? ` ${esc(a.transfer_year)}학년` : ''}</span>${a.admission_kind === '편입학' ? `<br><small>${isPartner(a) ? '협약' + (partnerName(a) ? ' · ' + esc(partnerName(a)) : '') : '비협약'}</small>` : ''}</td>
        <td ${rs}>${photoUrl(a) ? `<img src="${esc(photoUrl(a))}" style="width:14mm;height:18.6mm;object-fit:cover" alt="">` : ''}</td>
        <td ${rs} class="nm">${esc(a.name_ko)}<br><small>${esc(a.name_en)}</small></td><td ${rs} class="nw">${esc(a.nationality)}</td><td ${rs} class="nw">${esc(langLabel(a, true))}</td><td ${rs} class="hs">${esc(a.high_school || '')}</td>` : ''}
        ${showDir ? `<td class="nw">${isSplit(a, t) ? esc(whoName(a, t) || '미배정') : (t === '원장' ? '국제교류원장' : '학과장')}</td>` : ''}<td>${e ? esc(e.item1 || '') : ''}</td><td>${e ? esc(e.item2 || '') : ''}</td><td>${e ? esc(e.item3 || '') : ''}</td><td class="nw">${e ? esc(e.result || '') : ''}</td>
        <td class="cmt">${e && e.comment ? esc(e.comment) : ''}</td></tr>`).join('');
    }).join('');
    // 이 장에 실제로 평가한 사람마다 서명란 하나 (같은 사람은 한 번만)
    const signsFor = t => {
      const m = new Map();
      g.apps.forEach(a => {
        const lbl = isSplit(a, t) ? `${t === '원장' ? '국제교류원 ' : ''}${whoLabel(a, t)}${t === '학과장' ? ` (${deptName(did)})` : ''}`
          : (t === '원장' ? '국제교류원장' : `학과장 (${deptName(did)})`);
        const e = getEv(a.id, t);
        if (!m.has(lbl)) m.set(lbl, null);
        if (!m.get(lbl) && e && e.submitted && e.signature) m.set(lbl, e);
      });
      return [...m].map(([l, e]) => signLine(l, e)).join('');
    };
    const who = g.split ? ` &nbsp; <b>면접위원:</b> ${g.p ? `${esc(g.p.evaluator_name || '')} (${g.p.order_from}~${g.p.order_to}번)` : '미배정'}` : '';
    return `<div class="doc sheet ev-sheet">
    <h2>외국인 특별전형 면접평가표 (${esc(S.term.name)})</h2>
    <div style="margin-bottom:4mm"><b>학과:</b> ${esc(deptName(did))}${who} &nbsp; <b>출력일:</b> ${todayYMD()}</div>
    <table><thead><tr><th class="nw">순서</th><th class="nw">접수번호</th><th class="nw">사진</th><th class="nm">성명</th><th class="nw">국적</th><th class="nw">어학</th><th class="hs">출신고교</th>${showDir ? '<th>평가자</th>' : ''}
      <th class="it">${esc(EV_ITEMS[0])}</th><th class="it">${esc(EV_ITEMS[1])}</th><th class="it">${esc(EV_ITEMS[2])}</th><th class="nw">판정</th><th class="cmt">평가의견</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div style="margin-top:5mm;font-size:9pt">A: 우수(탁월) · B: 보통(적격) · C: 미흡(불합격) — C가 하나라도 있으면 불합격</div>
    <div class="ev-signs">${signsFor('학과장')}${showDir ? signsFor('원장') : ''}</div></div>`;
  }).join('');
  return pages;
}

/* ---------- 면접위원 배정 (총괄관리자) ----------
   학과마다 학과 쪽 / 국제교류원 쪽 면접위원을 면접 순서 범위로 나눕니다.
   예) 항공운항과 학과: 학과장 1~20번, ○○○ 교수 21~40번 / 국제교류원: 원장 1~20번, 국제교류팀 ○○○ 21~40번 */
let panelDept = '', panelDraft = [], panelProfiles = [];
function panelDepts() {
  const m = new Map();
  S.apps.filter(a => S.interviews[a.id]).forEach(a => { if (!m.has(String(a.department_id))) m.set(String(a.department_id), a.department_id); });
  return [...m].map(([id, raw]) => ({ id, raw, name: deptName(raw) })).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}
async function openPanelModal() {
  if (!S.panelReady) { toast('면접위원 배정 SQL(2026-11-25_면접위원_배정.sql)을 먼저 Supabase에 적용하세요.', 'err'); return; }
  const { data, error } = await sb.from('profiles').select('*');
  if (error) { toast(errMsg(error), 'err'); return; }
  panelProfiles = (data || []).filter(p => p.active);
  panelDraft = (S.panels || []).map(p => ({ department_id: p.department_id, evaluator_type: p.evaluator_type, profile_id: p.profile_id, order_from: p.order_from, order_to: p.order_to }));
  const depts = panelDepts();
  if (!depts.some(d => d.id === panelDept)) panelDept = depts.length ? depts[0].id : '';
  openModal(`${mHead('면접위원 배정', '면접 순서로 나눠서 여러 명이 평가할 때 지정합니다')}
   <div class="m-body" id="pn-body"></div>
   <div class="m-foot"><span class="muted small" style="margin-right:auto">다른 학과에서 고친 내용도 함께 저장됩니다.</span><button class="btn" onclick="closeModal(this.closest('.backdrop'))">취소</button><button class="btn pri" onclick="savePanels()">저장</button></div>`, { wide: true, sticky: true });
  renderPanelBody();
}
function renderPanelBody() {
  const body = $('#pn-body'); if (!body) return;
  const depts = panelDepts();
  if (!depts.length) { body.innerHTML = '<div class="muted">면접 대상자가 없습니다. 먼저 지원자를 “면접심사”로 바꾸고 면접 순서를 지정하세요.</div>'; return; }
  const apps = S.apps.filter(a => S.interviews[a.id] && String(a.department_id) === panelDept);
  const orders = apps.map(orderOf).filter(o => o != null);
  const max = orders.length ? Math.max(...orders) : 0, noOrder = apps.length - orders.length;
  const side = t => {
    const rows = panelDraft.map((p, i) => ({ p, i })).filter(x => String(x.p.department_id) === panelDept && x.p.evaluator_type === t);
    const cands = panelProfiles.filter(p => t === '학과장' ? p.role === 'dept' && String(p.department_id) === panelDept : ['director', 'staff', 'admin'].includes(p.role));
    const covered = apps.filter(a => { const o = orderOf(a); return o != null && rows.some(x => o >= x.p.order_from && o <= x.p.order_to); }).length;
    const title = t === '학과장' ? '학과 면접위원' : '국제교류원 면접위원';
    const state = rows.length ? `배정된 지원자 ${covered}/${apps.length}명${covered < apps.length ? ' — <b style="color:var(--red,#c00)">배정 안 된 지원자가 있습니다</b>' : ''}`
      : `배정 없음 → ${t === '학과장' ? '학과장' : '국제교류원장'}이 전원 평가`;
    return `<div class="sec"><h3>${title} <span class="muted small">${state}</span></h3>
     ${rows.map(({ p, i }) => `<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
       <select onchange="panelDraft[${i}].profile_id=this.value" style="min-width:220px"><option value="">— 평가자 선택 —</option>${cands.map(c => `<option value="${c.id}" ${c.id === p.profile_id ? 'selected' : ''}>${esc(c.display_name)} (${esc(ROLE_LABEL[c.role] || c.role)})</option>`).join('')}</select>
       <input type="number" min="1" style="width:70px" value="${p.order_from == null ? '' : p.order_from}" onchange="panelDraft[${i}].order_from=this.value===''?null:Number(this.value);renderPanelBody()">
       ~ <input type="number" min="1" style="width:70px" value="${p.order_to == null ? '' : p.order_to}" onchange="panelDraft[${i}].order_to=this.value===''?null:Number(this.value);renderPanelBody()"> 번
       <button class="btn sm" onclick="panelDraft.splice(${i},1);renderPanelBody()">삭제</button></div>`).join('')}
     ${cands.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" onclick="panelAdd('${t}')">＋ 면접위원 추가</button>${rows.length > 1 && max ? `<button class="btn sm" onclick="panelSplit('${t}',${max})">1~${max}번을 똑같이 나누기</button>` : ''}</div>`
      : `<div class="muted small">${t === '학과장' ? '이 학과에 학과장 권한 계정이 없습니다. 계정 관리에서 권한 “학과장”, 학과 “' + esc(deptName(apps[0] && apps[0].department_id)) + '”로 먼저 만드세요.' : '선택할 수 있는 국제교류원 계정이 없습니다.'}</div>`}</div>`;
  };
  body.innerHTML = `<div class="notice" style="margin-bottom:10px">배정이 없는 학과는 지금처럼 학과장·국제교류원장이 전원을 평가합니다. 추가 교수님은 계정 관리에서 권한 “학과장”, 해당 학과로 계정을 만든 뒤 여기서 고르세요.</div>
   <label class="fld" style="max-width:280px"><span>학과 선택</span><select onchange="panelDept=this.value;renderPanelBody()">${depts.map(d => {
     const n = panelDraft.filter(p => String(p.department_id) === d.id).length;
     return `<option value="${d.id}" ${d.id === panelDept ? 'selected' : ''}>${esc(d.name)}${n ? ` (배정 ${n}명)` : ''}</option>`; }).join('')}</select></label>
   <div class="muted small" style="margin:6px 0 10px">면접 대상 ${apps.length}명 · 면접 순서 ${max ? `1~${max}번` : '미지정'}${noOrder ? ` · <b>순서 미지정 ${noOrder}명은 배정되지 않으니 먼저 면접 순서를 정하세요</b>` : ''}</div>
   ${side('학과장')}${side('원장')}`;
}
function panelAdd(t) {
  const d = panelDepts().find(x => x.id === panelDept); if (!d) return;
  panelDraft.push({ department_id: d.raw, evaluator_type: t, profile_id: '', order_from: null, order_to: null });
  renderPanelBody();
}
function panelSplit(t, max) {
  const rows = panelDraft.filter(p => String(p.department_id) === panelDept && p.evaluator_type === t);
  const size = Math.ceil(max / rows.length);
  rows.forEach((p, i) => { p.order_from = i * size + 1; p.order_to = Math.min(max, (i + 1) * size); });
  renderPanelBody();
}
async function savePanels() {
  const byKey = {};
  for (const p of panelDraft) {
    const where = `${deptName(p.department_id)} ${p.evaluator_type === '원장' ? '국제교류원' : '학과'} 면접위원`;
    if (!p.profile_id) { toast(`${where}: 평가자를 고르세요.`, 'err'); return; }
    if (!(p.order_from >= 1) || !(p.order_to >= 1) || p.order_from > p.order_to) { toast(`${where}: 면접 순서 범위를 바르게 입력하세요. (예: 1 ~ 20)`, 'err'); return; }
    const k = p.department_id + '|' + p.evaluator_type;
    for (const q of byKey[k] || []) if (p.order_from <= q.order_to && q.order_from <= p.order_to) { toast(`${where}: ${q.order_from}~${q.order_to}번과 범위가 겹칩니다.`, 'err'); return; }
    (byKey[k] = byKey[k] || []).push(p);
  }
  const name = id => (panelProfiles.find(x => x.id === id) || {}).display_name || '';
  const rows = panelDraft.map(p => ({ term_id: String(S.term.id), department_id: p.department_id, evaluator_type: p.evaluator_type, profile_id: p.profile_id, evaluator_name: name(p.profile_id), order_from: p.order_from, order_to: p.order_to }));
  setBusy(true);
  const del = await sb.from('interview_panels').delete().eq('term_id', String(S.term.id));
  let err = del.error;
  if (!err && rows.length) err = (await sb.from('interview_panels').insert(rows)).error;
  setBusy(false);
  if (err) { toast(errMsg(err), 'err'); return; }
  toast('면접위원 배정을 저장했습니다.');
  closeModal(); await loadAux(); renderShell();
}


/* ---------- 자동 저장 ----------
   A·B·C, 판정, 의견을 바꾸면 1.5초 뒤 자동으로 임시저장합니다. 제출은 하지 않습니다. */
const evTimers = {}, evBusy = {}, evSavedAt = {};
function evSavedText(id) {
  const t = evSavedAt[id];
  return t === 'saving' ? '저장 중…' : t === 'err' ? '<span style="color:var(--bad,#c0392b)">자동 저장 실패 — [지금 저장]을 눌러 주세요</span>'
    : t ? `자동 저장됨 ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}` : '자동 저장';
}
function evShowSaved(id) { const el = $(`#ev-${id} .ev-saved`); if (el) el.innerHTML = evSavedText(id); }
function evTouch(id) {
  const a = S.apps.find(x => x.id === id), t = myTypeFor(a); if (!t) return;
  const e = getEv(id, t); if ((e && e.submitted) || a.status !== '면접심사') return;
  clearTimeout(evTimers[id]);
  evTimers[id] = setTimeout(() => evAutoSave(id), 1500);
}
const evSame = (d, e) => ['item1', 'item2', 'item3', 'result'].every(k => (d[k] || '') === (e[k] || '')) && (d.comment || '').trim() === (e.comment || '');
async function evAutoSave(id) {
  delete evTimers[id];
  if (evBusy[id]) { evTouch(id); return; } // 저장 중이면 끝난 뒤 다시
  const a = S.apps.find(x => x.id === id), t = myTypeFor(a), d = S.evalDraft[id];
  if (!t || !d) return;
  const e = getEv(id, t);
  if (e && e.submitted) return;
  if (e ? evSame(d, e) : !(d.item1 || d.item2 || d.item3 || (d.comment || '').trim())) return;
  evBusy[id] = true; evSavedAt[id] = 'saving'; evShowSaved(id);
  const err = await writeEval(id, t, { ...d }, false, null, true);
  evBusy[id] = false; evSavedAt[id] = err ? 'err' : new Date(); evShowSaved(id);
  updateEvalStats();
}
/* 제출·저장 전에 기다리던 자동 저장을 끝냅니다 */
async function evFlushAuto() {
  const ids = Object.keys(evTimers);
  ids.forEach(id => clearTimeout(evTimers[id]));
  for (const id of ids) await evAutoSave(id);
  while (Object.values(evBusy).some(Boolean)) await new Promise(r => setTimeout(r, 100));
}
window.addEventListener('beforeunload', e => { if (Object.keys(evTimers).length || Object.values(evBusy).some(Boolean)) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- 실시간 인원 (합격 · 불합격 · 보류 · 미평가) ----------
   학과장·학과 면접위원은 학과 판정, 그 밖에는 국제교류원(최종) 판정 기준.
   내가 입력 중인 판정은 바로 반영되고, 다른 평가자의 저장 내용은 20초마다 불러옵니다. */
function evalStatsHtml() {
  const list = evalTargets(true); if (!list.length) return '<div id="ev-stats"></div>';
  const side = S.role === 'dept' ? '학과장' : '원장';
  const c = { 합격: 0, 불합격: 0, 보류: 0, 미평가: 0 }; let sub = 0;
  list.forEach(a => {
    const e = getEv(a.id, side), d = myTypeFor(a) === side ? S.evalDraft[a.id] : null;
    const r = d ? (d.item1 && d.item2 && d.item3 ? d.result || autoResult(d) : '') : (e && e.result) || '';
    c[c[r] != null && r !== '미평가' ? r : '미평가']++;
    if (e && e.submitted) sub++;
  });
  const chip = (k, cls) => `<div class="ev-stat ${cls}"><span>${k}</span><b>${c[k]}</b></div>`;
  return `<div id="ev-stats" class="ev-stats">${chip('합격', 'pass')}${chip('불합격', 'fail')}${chip('보류', 'hold')}${chip('미평가', 'none')}
   <div class="ev-stat-note"><b>${side === '원장' ? '국제교류원 판정' : '학과 판정'} 기준</b><br>전체 ${list.length}명 · 제출 완료 ${sub}명<br><span class="muted">작성 중인 판정 포함 · 20초마다 자동 갱신</span></div></div>`;
}
function updateEvalStats() {
  const el = $('#ev-stats'); if (el) el.outerHTML = evalStatsHtml();
  const hdr = $('.toolbar'); if (hdr) hdr.innerHTML = toolbarHtml();
}
let evPollTimer = null;
function evStartPoll() { if (!evPollTimer) evPollTimer = setInterval(evPoll, 20000); }
async function evPoll() {
  if (S.tab !== 'eval' || document.hidden || !S.term) return;
  if (Object.keys(evTimers).length || Object.values(evBusy).some(Boolean)) return;
  const ids = S.apps.filter(a => S.interviews[a.id] || a.status === '면접심사').map(a => a.id);
  if (!ids.length) return;
  const rows = [];
  for (const part of chunk(ids, 100)) {
    const { data, error } = await sb.from('interview_evaluations').select('*').in('applicant_id', part);
    if (error) return;
    rows.push(...(data || []));
  }
  let changed = false;
  rows.forEach(r => {
    const k = r.applicant_id + '|' + r.evaluator_type, o = S.evals[k];
    if (!o || o.updated_at !== r.updated_at || o.submitted !== r.submitted || o.result !== r.result) { S.evals[k] = r; changed = true; }
  });
  if (!changed || S.tab !== 'eval') return;
  // 입력 중이면 화면은 그대로 두고 인원만 갱신
  const ae = document.activeElement;
  if (ae && $('#main') && $('#main').contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) updateEvalStats();
  else keepScrollRender();
}
