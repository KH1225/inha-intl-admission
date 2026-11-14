'use strict';
/* ===== 개인정보 보호 =====
   - logAccess: 엑셀 내려받기, 인쇄를 access_log 에 기록 (실패해도 작업은 계속)
   - 열람 기록 화면 (총괄관리자): 원문 보기 기록(pii_access_log) + access_log
   - 보유기간 경과 자료 파기 (총괄관리자): 학기 단위, 파기 대장
   - 출력물 표시: 내부용 인쇄물·엑셀에 "개인정보 포함 · 외부 반출 금지 · 출력자 · 일시" */

function logAccess(action, ids, detail) {
  try {
    if (!S.user) return;
    const list = (ids && ids.length ? [...new Set(ids)] : [null]).slice(0, 500);
    const rows = list.map(id => ({ user_id: S.user.id, action: String(action).slice(0, 100), applicant_id: id, detail: detail ? String(detail).slice(0, 500) : null }));
    Promise.resolve(sb.from('access_log').insert(rows)).then(r => { if (r && r.error) console.warn('열람 기록 실패', r.error); }).catch(() => {});
  } catch (e) { /* 기록 실패는 무시 */ }
}

/* 출력물 표시 문구 */
const nowStamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const privMarkText = () => `개인정보 포함 · 외부 반출 금지 · 출력: ${(S.profile && S.profile.display_name) || ''} ${nowStamp()}`;

/* ---------- 열람 기록 화면 ---------- */
function openAccessLog() {
  const to = todayYMD(), from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  openModal(`${mHead('개인정보 열람 기록', '누가 언제 누구의 개인정보를 열람·출력·내려받았는지 (총괄관리자만 볼 수 있음)')}
   <div class="m-body">
    <div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin-bottom:10px">
     ${field('시작일', `<input id="al-from" type="date" value="${from}">`)}${field('종료일', `<input id="al-to" type="date" value="${to}">`)}
     ${field('작업', `<select id="al-act" onchange="renderAccessLog()"><option value="">전체</option></select>`)}
     ${field('검색', `<input id="al-q" placeholder="사용자·지원자 이름" oninput="renderAccessLog()">`)}
     <button class="btn pri" onclick="loadAccessLog()">조회</button></div>
    <div id="al-out" class="muted">불러오는 중…</div></div>
   <div class="m-foot"><button class="btn" onclick="exportAccessLog()">엑셀(CSV)로 저장</button><button class="btn pri" onclick="closeModal(this.closest('.backdrop'))">닫기</button></div>`, { wide: true });
  loadAccessLog();
}
let ALOG = [];
async function loadAccessLog() {
  const out = $('#al-out'); if (!out) return;
  out.textContent = '불러오는 중…';
  const { data, error } = await sb.rpc('get_access_logs', { p_from: $('#al-from').value, p_to: $('#al-to').value });
  if (error) { out.innerHTML = `<div class="warn">${/get_access_logs|function/i.test(errMsg(error)) ? '열람 기록 기능이 DB에 아직 없습니다. sql/2026-11-14_개인정보_열람기록_파기.sql 을 실행해 주세요.' : esc(errMsg(error))}</div>`; return; }
  ALOG = data || [];
  const acts = [...new Set(ALOG.map(r => r.action))].sort();
  const sel = $('#al-act'), cur = sel.value;
  sel.innerHTML = '<option value="">전체</option>' + acts.map(a => `<option ${a === cur ? 'selected' : ''}>${esc(a)}</option>`).join('');
  renderAccessLog();
}
function accessLogRows() {
  const act = $('#al-act').value, q = $('#al-q').value.trim().toLowerCase();
  return ALOG.filter(r => (!act || r.action === act) && (!q || [r.user_name, r.name_ko, r.receipt_no].some(v => String(v || '').toLowerCase().includes(q))));
}
function renderAccessLog() {
  const out = $('#al-out'); if (!out) return;
  const rows = accessLogRows();
  const byUser = {}; rows.forEach(r => { byUser[r.user_name] = (byUser[r.user_name] || 0) + 1; });
  out.innerHTML = `<div class="muted small" style="margin-bottom:6px">${rows.length}건${ALOG.length >= 3000 ? ' (최근 3,000건까지 표시 — 기간을 좁혀 주세요)' : ''} · 사용자별: ${Object.entries(byUser).map(([u, n]) => `${esc(u)} ${n}`).join(', ') || '-'}</div>
   <div class="tbl-wrap" style="max-height:420px;overflow:auto"><table class="tbl"><thead><tr><th>일시</th><th>사용자</th><th>작업</th><th>지원자</th><th>내용</th></tr></thead><tbody>
   ${rows.map(r => `<tr><td class="nw">${esc(fmtDateTime(r.at))}</td><td class="nw">${esc(r.user_name)}</td><td>${esc(r.action)}</td><td class="nw">${r.receipt_no ? esc(r.receipt_no) + ' ' + esc(r.name_ko || '') : '<span class="muted">-</span>'}</td><td class="small">${esc(r.detail || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted c">기록이 없습니다</td></tr>'}
   </tbody></table></div>`;
}
function exportAccessLog() {
  const rows = accessLogRows(); if (!rows.length) { toast('저장할 기록이 없습니다.', 'err'); return; }
  const cell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? '"' + s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1") + '"' : s; };
  const csv = '﻿' + [[privMarkText()], ['일시', '사용자', '작업', '접수번호', '지원자', '내용']].concat(rows.map(r => [fmtDateTime(r.at), r.user_name, r.action, r.receipt_no, r.name_ko, r.detail])).map(r => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const el = document.createElement('a'); el.href = url; el.download = `개인정보_열람기록_${todayYMD()}.csv`; el.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  logAccess('열람 기록 내려받기', null, `${rows.length}건`);
}

/* ---------- 보유기간 경과 자료 파기 ---------- */
const PURGE_YEARS_DEFAULT = 10;
async function openPurge() {
  const bd = openModal(`${mHead('보유기간 경과 개인정보 파기', '입학 지원자 개인정보 수집·이용 동의서의 보유기간(10년)이 지난 학기 자료를 지웁니다')}
   <div class="m-body">
    <div class="notice small">파기하면 그 학기 지원자의 정보·사진·서류 체크·면접 평가·납부·문서 발급·메일 기록이 <b>모두 영구 삭제</b>되고 되돌릴 수 없습니다.
      열람 기록과 파기 대장은 남습니다. 보유기간은 학년도 기준으로 계산합니다 (예: 2027학년도 자료, 10년 → 2037년부터 파기 가능).</div>
    <div class="grid2" style="margin:10px 0">${field('보유기간 (년)', `<input id="pg-years" type="number" min="1" max="30" value="${PURGE_YEARS_DEFAULT}" oninput="renderPurge()">`)}</div>
    <div id="pg-out" class="muted">불러오는 중…</div>
    <div class="sec" style="margin-top:14px"><h3>파기 대장</h3><div id="pg-hist" class="muted small">불러오는 중…</div></div></div>
   <div class="m-foot"><button class="btn pri" onclick="closeModal(this.closest('.backdrop'))">닫기</button></div>`, { wide: true, sticky: true });
  const [pv, hi] = await Promise.all([sb.rpc('purge_preview'), sb.rpc('purge_history')]);
  if (pv.error) { $('#pg-out', bd).innerHTML = `<div class="warn">${/purge_preview|function/i.test(errMsg(pv.error)) ? '파기 기능이 DB에 아직 없습니다. sql/2026-11-14_개인정보_열람기록_파기.sql 을 실행해 주세요.' : esc(errMsg(pv.error))}</div>`; $('#pg-hist', bd).textContent = ''; return; }
  bd._terms = pv.data || [];
  renderPurge();
  const h = hi.data || [];
  $('#pg-hist', bd).innerHTML = h.length ? `<table class="tbl"><thead><tr><th>파기 일시</th><th>학기</th><th>지원자 수</th><th>보유기간</th><th>처리자</th></tr></thead><tbody>${h.map(r => `<tr><td>${esc(fmtDateTime(r.purged_at))}</td><td>${esc(r.term_label)}</td><td>${r.n_applicants}명</td><td>${r.keep_years}년</td><td>${esc(r.purged_by)}</td></tr>`).join('')}</tbody></table>` : '파기한 기록이 없습니다.';
}
function renderPurge() {
  const out = $('#pg-out'); if (!out) return;
  const bd = out.closest('.backdrop'), years = Math.max(1, Number($('#pg-years').value) || PURGE_YEARS_DEFAULT), now = new Date().getFullYear();
  const terms = bd._terms || [];
  out.innerHTML = `<table class="tbl"><thead><tr><th>학기</th><th>지원자 수</th><th>파기 가능 시점</th><th></th></tr></thead><tbody>
   ${terms.map(t => { const ok = Number(t.year) + years <= now;
      return `<tr><td>${esc(t.year)}학년도 ${esc(t.semester)}</td><td>${t.n}명</td><td>${ok ? '<b style="color:var(--bad)">보유기간 지남</b>' : `${Number(t.year) + years}년부터`}</td>
       <td>${ok && t.n ? `<button class="btn sm bad" onclick="runPurge('${esc(t.term_id)}','${esc(t.year)}학년도 ${esc(t.semester)}',${t.n})">파기</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="4" class="muted c">학기가 없습니다</td></tr>'}
   </tbody></table>`;
}
async function runPurge(termId, label, n) {
  const years = Math.max(1, Number($('#pg-years').value) || PURGE_YEARS_DEFAULT);
  const typed = prompt(`${label} 지원자 ${n}명의 개인정보와 파일을 영구 삭제합니다. 되돌릴 수 없습니다.\n계속하려면 “${label} 파기”라고 입력하세요.`);
  if (typed == null) return;
  if (typed.trim() !== `${label} 파기`) { toast('입력한 문구가 달라 취소했습니다.', 'err'); return; }
  setBusy(true);
  try {
    // 1) 저장소 파일 먼저 (사진)
    const f = await sb.rpc('purge_term_files', { p_term: termId });
    if (f.error) throw f.error;
    const rows = f.data || [];
    const photos = rows.map(r => r.photo_path).filter(Boolean);
    for (const part of chunk(photos, 100)) await sb.storage.from('photos').remove(part);
    // 2) DB 자료 + 파기 대장
    const { data, error } = await sb.rpc('purge_term', { p_term: termId, p_keep_years: years });
    if (error) throw error;
    setBusy(false);
    toast(`${label} 지원자 ${data || 0}명의 자료를 파기했습니다. 파기 대장에 기록했습니다.`);
    closeModal(); await reloadAndRender(); openPurge();
  } catch (e) { setBusy(false); toast('파기 실패: ' + errMsg(e), 'err'); }
}
