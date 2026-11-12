'use strict';
/* ===== 엑셀 일괄 등록 ===== */
const IMPORT_HEADERS = ['접수번호(자동부여)', '한글성명*', '영문성명*', '성별(남/여)*', '생년월일(YYYY-MM-DD)*', '국적*', '입학구분(신입학/편입학)*', '지원학과(28개과)*', '지원경로', '전형유형', '어학능력(TOPIK)', '여권번호*', '외국인등록번호', '비자종류', '이메일*', '연락처', '출신고교', '출신대학', 'GPA(내신)', '심사진행상태', '장학금구분', '해외송금입금액', '비고메모'];
const normH = s => String(s == null ? '' : s).replace(/\(.*?\)/g, '').replace(/[*\s]/g, '');
let importRows = [];

function openImport() {
  importRows = [];
  openModal(`${mHead('엑셀 일괄 등록', `${esc(S.term.name)} 모집에 등록됩니다`)}
   <div class="m-body">
    <ol class="small" style="line-height:1.8;margin:0 0 12px 18px">
     <li>아래 <b>양식 내려받기</b>로 받은 파일에 지원자를 입력하세요. (기존 양식을 그대로 써도 됩니다)</li>
     <li>파일을 선택하면 먼저 <b>미리보기</b>로 오류를 확인합니다. 아직 저장되지 않습니다.</li>
     <li>문제가 없으면 <b>등록 실행</b>을 누르세요. 오류가 있는 줄은 건너뜁니다.</li></ol>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button class="btn" onclick="downloadTemplate()">양식 내려받기</button>
      <input type="file" id="imp-file" accept=".xlsx,.xls,.csv" onchange="onImportFile(this.files[0])"></div>
    <div class="muted small" style="margin-top:8px">※ 심사진행상태: ${can.admin() ? '시트의 값(서류심사·면접심사 등)이 반영됩니다. “서류접수”는 서류심사로 처리됩니다.' : '모두 “서류심사”로 등록됩니다.'} 장학금은 등록과 동시에 자동으로 배정됩니다.</div>
    <div id="imp-result" style="margin-top:12px"></div></div>
   <div class="m-foot"><button class="btn" onclick="closeModal(this.closest('.backdrop'))">닫기</button>
    <button class="btn pri" id="imp-run" disabled onclick="runImport()">등록 실행</button></div>`, { wide: true, sticky: true });
}
function downloadTemplate() {
  if (!window.XLSX) { toast('엑셀 라이브러리를 불러오지 못했습니다.', 'err'); return; }
  const ws = XLSX.utils.aoa_to_sheet([IMPORT_HEADERS]);
  ws['!cols'] = IMPORT_HEADERS.map(h => ({ wch: Math.max(12, h.length * 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '신규지원자등록양식');
  XLSX.writeFile(wb, '인하공전_외국인특별전형_지원자등록양식.xlsx');
}
function cellStr(v) { return v == null ? '' : String(v).trim(); }
function parseDateCell(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return `${v.getFullYear()}-${p2(v.getMonth() + 1)}-${p2(v.getDate())}`;
  if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400000)); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`; }
  const m = String(v).trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  return m ? `${m[1]}-${p2(m[2])}-${p2(m[3])}` : 'INVALID';
}
function onImportFile(file) {
  if (!file) return;
  if (!window.XLSX) { toast('엑셀 라이브러리를 불러오지 못했습니다.', 'err'); return; }
  const rd = new FileReader();
  rd.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
      buildImportPreview(rows);
    } catch (err) { $('#imp-result').innerHTML = `<div class="err-box">파일을 읽지 못했습니다: ${esc(err.message)}</div>`; }
  };
  rd.readAsArrayBuffer(file);
}
function buildImportPreview(rows) {
  const hdr = (rows[0] || []).map(normH);
  const col = name => hdr.indexOf(normH(name));
  const idx = {}; IMPORT_HEADERS.forEach(h => { idx[normH(h)] = col(h); });
  const miss = IMPORT_HEADERS.filter(h => idx[normH(h)] < 0 && /\*/.test(h));
  if (miss.length) { $('#imp-result').innerHTML = `<div class="err-box">필수 열을 찾을 수 없습니다: ${esc(miss.join(', '))}\n양식의 첫 줄(제목줄)을 바꾸지 마세요.</div>`; return; }
  const get = (r, h) => { const i = idx[normH(h)]; return i >= 0 ? r[i] : ''; };
  const deptByName = Object.fromEntries(S.depts.map(d => [d.name_ko.replace(/\s/g, ''), d]));
  const qualByName = {}; S.quals.forEach(q => { qualByName[q.name_ko.replace(/\s/g, '')] = q.code; qualByName[q.code] = q.code; });
  const seen = new Set();
  importRows = [];
  rows.slice(1).forEach((r, i) => {
    if (r.every(c => cellStr(c) === '')) return;
    const errs = [];
    const name_ko = cellStr(get(r, '한글성명')), name_en = cellStr(get(r, '영문성명')).replace(/\s+/g, ' ').toUpperCase();
    const gender = cellStr(get(r, '성별')).replace(/자$|성$/, '');
    const birth = parseDateCell(get(r, '생년월일'));
    const nat = cellStr(get(r, '국적'));
    const kindRaw = cellStr(get(r, '입학구분')) || '신입학';
    const kind = kindRaw.startsWith('편') ? '편입학' : '신입학';
    const dname = cellStr(get(r, '지원학과')).replace(/\s/g, '');
    const dept = deptByName[dname];
    const passport = cellStr(get(r, '여권번호')).replace(/\s/g, '').toUpperCase();
    if (!name_ko) errs.push('한글성명 없음'); if (!name_en) errs.push('영문성명 없음');
    if (!['남', '여'].includes(gender)) errs.push('성별은 남/여');
    if (!birth || birth === 'INVALID') errs.push('생년월일 형식 오류');
    if (!nat) errs.push('국적 없음');
    if (!dept) errs.push(`학과명 불일치(${dname || '비어 있음'})`);
    else if (/편입/.test(String(kind)) && !isTransferDept(dept)) errs.push(`편입학 불가 학과(${dept.name_ko}) — ${TRANSFER_DEPTS.join(', ')}만 가능`);
    if (!passport) errs.push('여권번호 없음');
    else { if (seen.has(passport)) errs.push('파일 안에서 여권번호 중복'); seen.add(passport); }
    const routeRaw = cellStr(get(r, '지원경로'));
    let route = '개별지원', agency_id = null, agencyNew = null, partnerId = null;
    if (/우리대학|본교/.test(routeRaw)) {
      route = ROUTE_ALUMNI;
    } else if (/국내/.test(routeRaw)) {
      route = ROUTE_DOMHS;
    } else if (/협약/.test(routeRaw)) {
      route = ROUTE_PARTNER;
      const m = routeRaw.match(/\((.+)\)/);
      const ps = m ? S.partners.find(x => x.name.replace(/\s/g, '').toLowerCase() === m[1].replace(/\s/g, '').toLowerCase()) : null;
      if (ps) partnerId = ps.id; else errs.push(m ? `협약학교 불일치(${m[1].trim()})` : '협약학교: 괄호 안에 학교명 필요');
    } else if (/유학원/.test(routeRaw)) {
      route = '유학원';
      const m = routeRaw.match(/\((.+)\)/);
      if (m) { const nm = m[1].trim(); const ag = S.agencies.find(x => x.name.toLowerCase() === nm.toLowerCase()); if (ag) agency_id = ag.id; else agencyNew = nm; }
    }
    const qRaw = cellStr(get(r, '전형유형')).replace(/\s/g, '');
    let qual = qRaw ? qualByName[qRaw] : null;
    if (qRaw && !qual) { if (/부모/.test(qRaw)) qual = 'T1'; else if (/전교육|해외/.test(qRaw)) qual = 'T2'; else errs.push(`전형유형 불일치(${qRaw})`); }
    const tk = cellStr(get(r, '어학능력')).match(/([1-6])\s*급?/);
    const topik = tk ? Number(tk[1]) : null;
    let status = '서류심사';
    const stRaw = cellStr(get(r, '심사진행상태'));
    if (can.admin() && stRaw) { const st = stRaw === '서류접수' ? '서류심사' : stRaw; if (STATUSES.includes(st)) status = st; else errs.push(`상태 불일치(${stRaw})`); }
    const email = cellStr(get(r, '이메일'));
    if (email && !/^\S+@\S+\.\S+$/.test(email)) errs.push('이메일 형식 오류');
    const gpaRaw = cellStr(get(r, 'GPA'));
    const gpa = gpaRaw !== '' && !isNaN(Number(gpaRaw)) ? Number(gpaRaw) : null;
    const rec = {
      name_ko, name_en, gender, birth_date: birth, nationality: nat, admission_kind: kind, department_id: dept ? dept.id : null,
      route, agency_id, ...(partnerId ? { partner_school_id: partnerId } : {}), qualification_code: qual || null, topik_level: topik, passport_no: passport,
      alien_reg_no: cellStr(get(r, '외국인등록번호')) || null, visa_type: cellStr(get(r, '비자종류')) || null,
      email: email || null, phone: cellStr(get(r, '연락처')) || null, high_school: cellStr(get(r, '출신고교')) || null, gpa,
      ...(S.hasCol && S.hasCol.prev_university && cellStr(get(r, '출신대학')) ? { prev_university: cellStr(get(r, '출신대학')) } : {}),
      memo: cellStr(get(r, '비고메모')) || null, term_id: S.term.id
    };
    const rn = cellStr(get(r, '접수번호'));
    if (rn) rec.receipt_no = rn;
    importRows.push({ line: i + 2, rec, status, agencyNew, errs });
  });
  const ok = importRows.filter(x => !x.errs.length).length, bad = importRows.length - ok;
  $('#imp-result').innerHTML = `<div><b>${importRows.length}</b>건 중 등록 가능 <b style="color:var(--ok,#16a34a)">${ok}</b>건, 오류 <b style="color:var(--bad,#dc2626)">${bad}</b>건</div>
   <div class="tbl-wrap" style="max-height:340px;overflow:auto;margin-top:8px"><table class="tbl"><thead><tr><th>줄</th><th>성명</th><th>영문</th><th>학과</th><th>상태</th><th>확인</th></tr></thead><tbody>
   ${importRows.slice(0, 300).map(x => `<tr><td>${x.line}</td><td>${esc(x.rec.name_ko)}</td><td>${esc(x.rec.name_en)}</td><td>${esc(x.rec.department_id ? deptName(x.rec.department_id) : '')}</td><td>${esc(x.status)}</td>
   <td>${x.errs.length ? `<span style="color:var(--bad,#dc2626)">${esc(x.errs.join(', '))}</span>` : (x.agencyNew ? `새 유학원 “${esc(x.agencyNew)}” 추가` : 'OK')}</td></tr>`).join('')}</tbody></table></div>
   ${importRows.length > 300 ? '<div class="muted small">앞 300건만 표시됩니다.</div>' : ''}`;
  $('#imp-run').disabled = ok === 0;
}
async function runImport() {
  const list = importRows.filter(x => !x.errs.length);
  if (!list.length) return;
  if (!confirm(`${list.length}건을 ${S.term.name} 모집에 등록합니다. 계속할까요?`)) return;
  const btn = $('#imp-run'); btn.disabled = true; setBusy(true);
  const fails = []; let done = 0;
  // 새 유학원 먼저 추가 (admin/staff 권한이 없으면 실패 처리)
  const newAg = {};
  for (const x of list) if (x.agencyNew && !newAg[x.agencyNew.toLowerCase()]) {
    const { data, error } = await sb.from('agencies').insert({ name: x.agencyNew }).select().single();
    if (!error) { newAg[x.agencyNew.toLowerCase()] = data.id; S.agencies.push(data); }
  }
  rebuildMaps();
  for (const x of list) {
    if (x.agencyNew) x.rec.agency_id = newAg[x.agencyNew.toLowerCase()] || (S.agencies.find(a => a.name.toLowerCase() === x.agencyNew.toLowerCase()) || {}).id || null;
    const { data, error } = await sb.from('applicants').insert(x.rec).select('id').single();
    if (error) { fails.push(`${x.line}줄 ${x.rec.name_ko}: ${errMsg(error)}`); continue; }
    done++;
    if (x.status !== '서류심사') {
      const r = await sb.from('applicants').update({ status: x.status }).eq('id', data.id);
      if (r.error) fails.push(`${x.line}줄 ${x.rec.name_ko}: 등록은 됐으나 상태 변경 실패 - ${errMsg(r.error)}`);
    }
    if (done % 10 === 0) $('#imp-result').innerHTML = `<div>등록 중… ${done}/${list.length}</div>`;
  }
  if (done) await syncScholarships();
  setBusy(false);
  $('#imp-result').innerHTML = `<div><b>${done}</b>건 등록 완료${fails.length ? `, <b>${fails.length}</b>건 실패` : ''}</div>${fails.length ? `<div class="err-box" style="white-space:pre-wrap;margin-top:8px">${esc(fails.join('\n'))}</div>` : ''}`;
  importRows = [];
  await reloadAndRender();
}
