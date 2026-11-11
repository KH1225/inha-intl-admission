'use strict';
/* ===== 면접 안내 메일 일괄 발송 (총괄관리자 / 국제교류팀) =====
   실제 발송은 Supabase 서버 함수 send-interview-mail 이 합니다.
   받는 사람은 DB에 저장된 지원자 이메일만 쓰이고, {이름}·{면접일시} 등은 서버가 DB 값으로 채웁니다. */

const MAIL_FN = 'send-interview-mail';
const MAIL_CHUNK = 20;
const MAIL_VARS = ['이름', '영문이름', '접수번호', '학과', '면접일시', '면접일시_영문', '면접순서', '면접순서_영문', '줌주소'];
const MAIL_DEFAULT = {
  subject: '[인하공업전문대학] 외국인 특별전형 면접 안내 / Interview Notice - {영문이름}',
  body: `{이름}({영문이름}) 님, 안녕하세요.
인하공업전문대학 국제교류팀입니다.
외국인 특별전형 서류심사를 통과하여 아래와 같이 온라인(Zoom) 면접을 안내드립니다.

■ 접수번호: {접수번호}
■ 지원학과: {학과}
■ 면접일시: {면접일시} (한국시간)
■ 면접순서: {면접순서}
■ Zoom 주소: {줌주소}

[유의사항]
- 면접 시작 10분 전까지 Zoom에 접속하여 대기해 주세요.
- Zoom 표시 이름은 "접수번호_영문이름"으로 설정해 주세요.
- 본인 확인을 위해 여권을 준비해 주세요.
- 카메라와 마이크를 켠 상태로 참여해야 합니다.

문의: 인하공업전문대학 국제교류팀 (본관 412호)

----------------------------------------

Dear {영문이름},

This is the International Affairs Team of Inha Technical College.
Congratulations on passing the document screening. Your online interview (Zoom) is scheduled as follows.

■ Application No.: {접수번호}
■ Department: {학과}
■ Date & Time: {면접일시_영문}
■ Interview Order: {면접순서_영문}
■ Zoom Link: {줌주소}

[Notes]
- Please join the Zoom meeting at least 10 minutes before your interview.
- Set your Zoom display name to "ApplicationNo_EnglishName".
- Please have your passport ready for identity verification.
- Your camera and microphone must be turned on.

Contact: International Affairs Team, Inha Technical College`
};

const mailKey = () => 'mailTpl:' + (S.term ? S.term.id : '');
function mailSaved() { try { return JSON.parse(localStorage.getItem(mailKey()) || 'null') || {}; } catch (e) { return {}; } }
function mailRemember(o) { try { localStorage.setItem(mailKey(), JSON.stringify(o)); } catch (e) { /* 무시 */ } }

let mailLogs = {};
function mailTargets() {
  return S.apps.filter(a => a.status === '면접심사' || (S.interviews[a.id] && !['불합격', '접수취소'].includes(a.status)))
    .sort((x, y) => { const ox = orderOf(x), oy = orderOf(y); if (ox != null && oy != null && ox !== oy) return ox - oy; if ((ox == null) !== (oy == null)) return ox == null ? 1 : -1; return String(x.receipt_no).localeCompare(String(y.receipt_no)); });
}
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
const zoomOk = u => !u || /^https:\/\/[^\s"'<>]+$/.test(u);

async function openMailModal() {
  const list = mailTargets();
  if (!list.length) { toast('면접심사 단계의 지원자가 없습니다.', 'err'); return; }
  mailLogs = {};
  try {
    for (const part of chunk(list.map(a => a.id), 100)) {
      const { data, error } = await sb.from('mail_logs').select('applicant_id,sent_at,ok').in('applicant_id', part).eq('kind', '면접안내').order('sent_at');
      if (error) break;
      (data || []).forEach(r => { if (r.ok) mailLogs[r.applicant_id] = r.sent_at; });
    }
  } catch (e) { /* 기록 테이블이 없어도 발송 화면은 엽니다 */ }
  const sv = mailSaved();
  const depts = [...new Set(list.map(a => a.department_id))].map(id => ({ id, name: deptName(id) })).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const rows = list.map(a => {
    const iv = S.interviews[a.id] || {}, ok = emailOk(a.email), sent = mailLogs[a.id];
    return `<tr><td><input type="checkbox" class="ml-ck" data-id="${a.id}" ${ok ? (sent ? '' : 'checked') : 'disabled'} onchange="mailCount()" style="width:auto"></td>
      <td>${orderOf(a) == null ? '-' : orderOf(a)}</td><td class="nw">${esc(a.receipt_no)}</td><td>${esc(a.name_ko)}<div class="muted small">${esc(a.name_en)}</div></td>
      <td>${esc(deptName(a.department_id))}</td><td>${ok ? esc(a.email) : '<span style="color:var(--bad)">이메일 없음</span>'}</td>
      <td class="nw">${iv.scheduled_at ? fmtDateTime(iv.scheduled_at) : '<span style="color:var(--warn)">미정</span>'}</td>
      <td class="nw">${sent ? `<span class="pill s-pass">${fmtDateTime(sent)}</span>` : '<span class="muted">-</span>'}</td></tr>`;
  }).join('');
  openModal(`${mHead('면접 안내 메일 발송', `${esc(S.term.name)} · 면접 대상 ${list.length}명`)}
   <div class="m-body">
    <div class="sec"><h3>받는 사람 <span class="muted small"><a href="#" onclick="mailAll(true);return false">전체 선택</a> · <a href="#" onclick="mailAll(false);return false">전체 해제</a> · 이미 보낸 사람과 이메일이 없는 사람은 처음에 선택되지 않습니다</span></h3>
     <div class="tbl-wrap" style="max-height:260px;overflow:auto"><table class="tbl" style="min-width:760px"><thead><tr><th></th><th>순서</th><th>접수번호</th><th>성명</th><th>학과</th><th>이메일</th><th>면접일시</th><th>보낸 시각</th></tr></thead><tbody>${rows}</tbody></table></div></div>
    <div class="sec"><h3>Zoom 주소 <span class="muted small">학과별 주소를 비워 두면 기본 주소가 들어갑니다</span></h3>
     <div class="grid2">${field('기본 Zoom 주소', `<input id="ml-zoom" placeholder="https://us06web.zoom.us/j/..." value="${esc(sv.zoom || '')}" oninput="mailPreview()">`, { full: 1 })}
      ${depts.map(d => field(`${esc(d.name)} Zoom 주소`, `<input class="ml-zd" data-dept="${d.id}" placeholder="(기본 주소 사용)" value="${esc((sv.zoomByDept || {})[d.id] || '')}" oninput="mailPreview()">`)).join('')}</div></div>
    <div class="sec"><h3>안내문 <span class="muted small"><a href="#" onclick="mailResetTpl();return false">기본 안내문으로 되돌리기</a></span></h3>
     <div class="muted small" style="margin-bottom:6px">아래 표시는 지원자마다 자동으로 바뀝니다: ${MAIL_VARS.map(v => `<code>{${v}}</code>`).join(' ')}</div>
     ${field('제목', `<input id="ml-subj" value="${esc(sv.subject || MAIL_DEFAULT.subject)}" oninput="mailPreview()">`)}
     ${field('본문', `<textarea id="ml-body" rows="14" oninput="mailPreview()">${esc(sv.body || MAIL_DEFAULT.body)}</textarea>`)}</div>
    <div class="sec"><h3>미리보기 <span class="muted small" id="ml-pv-who"></span></h3><div id="ml-pv" class="mail-pv"></div></div>
    <div id="ml-res"></div></div>
   <div class="m-foot"><span class="muted small" id="ml-cnt" style="margin-right:auto"></span>
    <button class="btn" onclick="closeModal(this.closest('.backdrop'))">닫기</button>
    <button class="btn" id="ml-test" onclick="mailSend(true)">내 메일로 테스트 발송</button>
    <button class="btn pri" id="ml-go" onclick="mailSend(false)">발송</button></div>`, { wide: true, sticky: true });
  mailCount(); mailPreview();
}
function mailAll(on) { $$('.ml-ck').forEach(c => { if (!c.disabled) c.checked = on; }); mailCount(); }
function mailChecked() { return $$('.ml-ck').filter(c => c.checked).map(c => c.dataset.id); }
function mailCount() {
  const n = mailChecked().length;
  $('#ml-cnt').textContent = `선택 ${n}명`;
  $('#ml-go').textContent = n ? `선택한 ${n}명에게 발송` : '발송';
  $('#ml-go').disabled = !n;
  mailPreview();
}
function mailResetTpl() { $('#ml-subj').value = MAIL_DEFAULT.subject; $('#ml-body').value = MAIL_DEFAULT.body; mailPreview(); }
function mailForm() {
  const zoomByDept = {};
  $$('.ml-zd').forEach(i => { if (i.value.trim()) zoomByDept[i.dataset.dept] = i.value.trim(); });
  return { subject: $('#ml-subj').value.trim(), body: $('#ml-body').value, zoom: $('#ml-zoom').value.trim(), zoomByDept };
}
/* 서버와 같은 방식으로 미리보기 */
function mailVars(a, f) {
  const iv = S.interviews[a.id] || {}, at = iv.scheduled_at;
  const ko = at ? (() => { const p = Object.fromEntries(new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(at)).map(x => [x.type, x.value])); return `${p.year}년 ${p.month}월 ${p.day}일(${p.weekday}) ${p.hour}:${p.minute}`; })() : '추후 안내';
  const en = at ? new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(at)) + ' (KST, UTC+9)' : 'To be announced';
  const o = orderOf(a);
  return { 이름: a.name_ko || '', 영문이름: a.name_en || '', 접수번호: a.receipt_no || '', 학과: deptName(a.department_id), 면접일시: ko, 면접일시_영문: en,
    면접순서: o != null ? `${o}번` : '추후 안내', 면접순서_영문: o != null ? `No. ${o}` : 'TBA', 줌주소: f.zoomByDept[a.department_id] || f.zoom || '추후 안내 (TBA)' };
}
const mailFill = (tpl, v) => tpl.replace(/\{([^{}]+)\}/g, (m, k) => (k in v ? v[k] : m));
function mailPreview() {
  const box = $('#ml-pv'); if (!box) return;
  const ids = mailChecked(), a = S.apps.find(x => x.id === ids[0]) || mailTargets()[0];
  const f = mailForm(), v = mailVars(a, f);
  $('#ml-pv-who').textContent = `${a.name_ko} (${a.receipt_no}) 기준`;
  const html = esc(mailFill(f.body, v)).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>');
  box.innerHTML = `<div class="mail-pv-subj">${esc(mailFill(f.subject, v))}</div><div>${html}</div>`;
}
async function mailInvoke(body) {
  const { data, error } = await sb.functions.invoke(MAIL_FN, { body });
  if (error) {
    let m = error.message || String(error);
    try { const j = await error.context.json(); if (j && j.error) m = j.error; } catch (e) { /* 무시 */ }
    if (/Failed to send a request|not found|404/i.test(m)) m = '메일 발송 서버 함수(send-interview-mail)가 아직 Supabase에 없습니다. 설정 안내를 따라 만들어 주세요.';
    throw new Error(m);
  }
  return data.results || [];
}
async function mailSend(test) {
  const f = mailForm();
  if (!f.subject || !f.body.trim()) { toast('제목과 본문을 입력하세요.', 'err'); return; }
  if (!zoomOk(f.zoom) || Object.values(f.zoomByDept).some(u => !zoomOk(u))) { toast('Zoom 주소는 https:// 로 시작해야 합니다.', 'err'); return; }
  const ids = mailChecked();
  if (!test && !ids.length) return;
  const noZoom = ids.filter(id => { const a = S.apps.find(x => x.id === id); return !(f.zoomByDept[a.department_id] || f.zoom); }).length;
  const noTime = ids.filter(id => !(S.interviews[id] || {}).scheduled_at).length;
  if (!test && !confirm(`${ids.length}명에게 면접 안내 메일을 발송합니다.` +
    (noZoom ? `\n⚠ Zoom 주소가 없는 지원자 ${noZoom}명 (‘추후 안내’로 표시됨)` : '') +
    (noTime ? `\n⚠ 면접 일시가 정해지지 않은 지원자 ${noTime}명 (‘추후 안내’로 표시됨)` : '') + '\n계속할까요?')) return;
  mailRemember({ subject: f.subject, body: f.body, zoom: f.zoom, zoomByDept: f.zoomByDept });
  const req = { subject: f.subject, body: f.body, zoom_default: f.zoom, zoom_by_dept: f.zoomByDept };
  const btns = ['#ml-go', '#ml-test'].map(s => $(s)); btns.forEach(b => { b.disabled = true; });
  const res = $('#ml-res');
  try {
    if (test) {
      const first = ids[0] || mailTargets()[0].id;
      const r = await mailInvoke({ ...req, applicant_ids: [first], test: true });
      const x = r[0] || {};
      toast(x.ok ? `테스트 메일을 ${x.to} 로 보냈습니다.` : `테스트 발송 실패: ${x.error || '알 수 없는 오류'}`, x.ok ? 'ok' : 'err');
      return;
    }
    const all = [];
    for (const part of chunk(ids, MAIL_CHUNK)) {
      res.innerHTML = `<div class="notice">발송 중… ${all.length}/${ids.length}</div>`;
      all.push(...await mailInvoke({ ...req, applicant_ids: part }));
    }
    const ok = all.filter(x => x.ok), bad = all.filter(x => !x.ok);
    ok.forEach(x => { mailLogs[x.id] = new Date().toISOString(); });
    res.innerHTML = `<div class="${bad.length ? 'warn' : 'notice'}"><b>${ok.length}명</b> 발송 완료${bad.length ? `, <b>${bad.length}명</b> 실패` : ''}</div>
      ${bad.length ? `<div class="err-box" style="white-space:pre-wrap;margin-top:6px">${esc(bad.map(x => { const a = S.apps.find(y => y.id === x.id) || {}; return `${a.receipt_no || ''} ${a.name_ko || ''}: ${x.error}`; }).join('\n'))}</div>` : ''}`;
    toast(bad.length ? `${ok.length}명 발송, ${bad.length}명 실패` : `${ok.length}명에게 발송했습니다.`, bad.length ? 'err' : 'ok');
    ok.forEach(x => { const c = $(`.ml-ck[data-id="${x.id}"]`); if (c) { c.checked = false; const td = c.closest('tr').lastElementChild; td.innerHTML = `<span class="pill s-pass">${fmtDateTime(mailLogs[x.id])}</span>`; } });
    mailCount();
  } catch (e) {
    res.innerHTML = `<div class="err-box">${esc(errMsg(e))}</div>`;
    toast(errMsg(e), 'err');
  } finally { btns.forEach(b => { b.disabled = false; }); mailCount(); }
}
