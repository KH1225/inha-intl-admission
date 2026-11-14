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
  const unsigned = t ? unsignedEvals(t) : [];
  $('#main').innerHTML = `
  <div class="notice">${esc(intro)}</div>
  ${unsigned.length ? `<div class="warn" style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">제출했지만 서명이 없는 평가가 <b>${unsigned.length}건</b> 있습니다. 서명해야 인쇄한 면접평가표에 서명이 나옵니다.
    <button class="btn pri sm" onclick="openSignPad(null)">한 번에 서명하기</button></div>` : ''}
  <div class="filters" style="margin:10px 0">
    ${depts.length ? `<select onchange="S.evalFilter.dept=this.value;renderEval()"><option value="">전체 학과</option>${depts.map(d => `<option value="${d.id}" ${String(S.evalFilter.dept) === String(d.id) ? 'selected' : ''}>${esc(d.name_ko)}</option>`).join('')}</select>` : ''}
    ${t ? `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" ${S.evalFilter.pending ? 'checked' : ''} onchange="S.evalFilter.pending=this.checked;renderEval()"> 미제출만 보기</label>` : ''}
    <span class="sp"></span>
    ${can.admin() ? `<button class="btn" onclick="openOrderModal()">면접 순서 · 일정 지정</button>` : ''}
    ${can.edit() ? `<button class="btn blue" onclick="openMailModal('면접안내')">면접 안내 메일</button>` : ''}
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
   
   <div class="kv" style="margin-top:8px"><div><span>국제교류원장</span><b>${evBadge(e1)} ${e1 && e1.submitted ? signImg(e1, '22px') : ''}</b></div><div><span>학과장</span><b>${evBadge(e2)} ${e2 && e2.submitted ? signImg(e2, '22px') : ''}</b></div></div>
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
    ${e.submitted ? '<span class="pill s-pass">제출 완료</span>' : '<span class="pill s-fix">작성 중</span>'}${e.submitted && signImg(e, '26px') ? ` <span class="sign-mini">${signImg(e, '26px')}</span>` : ''}</h3>
   <div class="muted small">${esc(deptName(a.department_id))} · ${esc(a.nationality)}${a.topik_level ? ' · TOPIK ' + a.topik_level + '급' : ''}${a.high_school ? ' · ' + esc(a.high_school) : ''}${a.prev_university ? ' · ' + esc(a.prev_university) : ''}${a.status !== '면접심사' ? ` · 현재 상태: ${esc(a.status)}` : ''}</div></div></div>
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
async function saveEval(id, submit, signature) {
  const t = myEvalType(); if (!t) return;
  const d = draftOf(id);
  const ta = $('#evc-' + id); if (ta) d.comment = ta.value;
  const complete = d.item1 && d.item2 && d.item3;
  if (submit) {
    if (!complete) { toast('3개 항목을 모두 평가해야 제출할 수 있습니다.', 'err'); return; }
    const a = S.apps.find(x => x.id === id);
    const res = d.result || autoResult(d);
    if (!signature) { openSignPad(id); return; }
  }
  const row = { item1: d.item1 || null, item2: d.item2 || null, item3: d.item3 || null, comment: d.comment.trim() || null, result: complete ? (d.result || autoResult(d)) : null };
  if (submit) { row.submitted = true; row.submitted_at = new Date().toISOString(); if (signature) row.signature = signature; }
  const exist = getEv(id, t);
  let res;
  if (exist) res = await sb.from('interview_evaluations').update(row).eq('applicant_id', id).eq('evaluator_type', t).select().single();
  else res = await sb.from('interview_evaluations').insert({ applicant_id: id, evaluator_type: t, ...row }).select().single();
  if (res.error) { toast(/signature/.test(errMsg(res.error)) ? '서명 저장 칸이 DB에 아직 없습니다. 관리자에게 SQL 적용을 요청하세요.' : errMsg(res.error), 'err'); return false; }
  S.evals[id + '|' + t] = res.data;
  delete S.evalDraft[id];
  toast(submit ? '평가를 제출했습니다.' : '임시저장했습니다.');
  if (t === '원장') await loadAux();
  const hdr = $('.toolbar'); if (hdr) hdr.innerHTML = toolbarHtml();
  keepScrollRender(id);
  return true;
}

/* ---------- 학과장 서명 ---------- */
const SIGN_KEY = () => 'lastSign:' + (S.user ? S.user.id : '');
function lastSign() { try { return localStorage.getItem(SIGN_KEY()) || ''; } catch (e) { return ''; } }
/* 이미 제출했지만 서명이 없는 내 평가 (서명 기능 이전에 제출한 것) */
function unsignedEvals(t) {
  const ids = new Set(S.apps.map(a => a.id));
  return Object.values(S.evals).filter(e => e.evaluator_type === t && e.submitted && !e.signature && ids.has(e.applicant_id));
}
function openSignPad(id) {
  const prev = lastSign();
  const t = myEvalType(), who = t === '원장' ? '국제교류원장' : '학과장';
  let head, info, warn, okLabel;
  if (id) {
    const a = S.apps.find(x => x.id === id), d = draftOf(id);
    const res = d.result || autoResult(d);
    head = mHead(`평가 제출 · ${who} 서명`, `${esc(a.name_ko)} · ${esc(a.receipt_no)}`);
    info = `<div class="kv" style="margin-bottom:10px">${EV_ITEMS.map((nm, i) => `<div><span>${esc(nm)}</span><b>${esc(d['item' + (i + 1)])} ${esc(EV_GRADES[d['item' + (i + 1)]] || '')}</b></div>`).join('')}<div><span>판정</span><b>${esc(res)}</b></div></div>`;
    warn = t === '원장' ? '제출 후에도 면접심사 단계에서는 수정할 수 있으며, 다시 제출할 때 새로 서명합니다.' : '제출 후에는 수정할 수 없습니다.';
    okLabel = '서명하고 제출';
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
    <button class="btn pri" id="sign-ok" onclick="submitSigned(${id ? `'${id}'` : 'null'})">${okLabel}</button></div>`, { sticky: true });
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
  const ok = id ? await saveEval(id, true, url) : await signSubmitted(url);
  if (!ok) { btn.disabled = false; return; }
  try { localStorage.setItem(SIGN_KEY(), url); } catch (e) { /* 무시 */ }
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
    : '<div class="muted">면접 대상자가 없습니다.</div>'}</div>
   <div class="m-foot"><button class="btn pri" onclick="closeModal(this.closest('.backdrop'))">닫기</button></div>`);
}

/* ---------- 면접평가표 인쇄 ---------- */
function printEvalSheet() { const list = evalTargets(); if (!list.length) { toast('인쇄할 지원자가 없습니다.', 'err'); return; } printHtml(evalSheetHtml(list), { mark: true }); if (typeof logAccess === 'function') logAccess('면접평가표 인쇄', list.map(a => a.id)); }
function evalSheetHtml(list) {
  const byDept = {};
  list.forEach(a => { (byDept[a.department_id] = byDept[a.department_id] || []).push(a); });
  const showDir = S.role !== 'dept';
  const pages = Object.keys(byDept).map(did => {
    const rows = byDept[did].map(a => {
      const o = orderOf(a);
      const rowsEv = [['학과장', getEv(a.id, '학과장')]].concat(showDir ? [['원장', getEv(a.id, '원장')]] : []);
      const rs = `rowspan="${rowsEv.length}"`;
      return rowsEv.map(([lbl, e], i) => `<tr>${i === 0 ? `<td ${rs} class="nw">${o == null ? '' : o}</td><td ${rs} class="nw">${esc(a.receipt_no)}<br><span class="kind ${a.admission_kind === '편입학' ? 'tr' : ''}">${esc(a.admission_kind || '')}${a.admission_kind === '편입학' && a.transfer_year ? ` ${esc(a.transfer_year)}학년` : ''}</span></td>
        <td ${rs}>${photoUrl(a) ? `<img src="${esc(photoUrl(a))}" style="width:14mm;height:18.6mm;object-fit:cover" alt="">` : ''}</td>
        <td ${rs} class="nm">${esc(a.name_ko)}<br><small>${esc(a.name_en)}</small></td><td ${rs} class="nw">${esc(a.nationality)}</td><td ${rs} class="nw">${a.topik_level ? a.topik_level + '급' : ''}</td><td ${rs} class="hs">${esc(a.high_school || '')}</td>` : ''}
        ${showDir ? `<td class="nw">${lbl === '원장' ? '국제교류원장' : lbl}</td>` : ''}<td>${e ? esc(e.item1 || '') : ''}</td><td>${e ? esc(e.item2 || '') : ''}</td><td>${e ? esc(e.item3 || '') : ''}</td><td class="nw">${e ? esc(e.result || '') : ''}</td>
        <td class="cmt">${e && e.comment ? esc(e.comment) : ''}</td></tr>`).join('');
    }).join('');
    const signOf = t => byDept[did].map(a => getEv(a.id, t)).find(e => e && e.submitted && e.signature);
    const signLine = (label, e) => `<div class="ev-sign"><span>${label}</span><span class="ln">${e ? signImg(e, '15mm') : ''}</span><span>(서명)</span></div>`;
    return `<div class="doc sheet ev-sheet">
    <h2>외국인 특별전형 면접평가표 (${esc(S.term.name)})</h2>
    <div style="margin-bottom:4mm"><b>학과:</b> ${esc(deptName(did))} &nbsp; <b>출력일:</b> ${todayYMD()}</div>
    <table><thead><tr><th class="nw">순서</th><th class="nw">접수번호</th><th class="nw">사진</th><th class="nm">성명</th><th class="nw">국적</th><th class="nw">TOPIK</th><th class="hs">출신고교</th>${showDir ? '<th>구분</th>' : ''}
      <th class="it">${esc(EV_ITEMS[0])}</th><th class="it">${esc(EV_ITEMS[1])}</th><th class="it">${esc(EV_ITEMS[2])}</th><th class="nw">판정</th><th class="cmt">평가의견</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div style="margin-top:5mm;font-size:9pt">A: 우수(탁월) · B: 보통(적격) · C: 미흡(불합격) — C가 하나라도 있으면 불합격</div>
    <div class="ev-signs">${signLine(`학과장 (${esc(deptName(did))})`, signOf('학과장'))}${showDir ? signLine('국제교류원장', signOf('원장')) : ''}</div></div>`;
  }).join('');
  return pages;
}
