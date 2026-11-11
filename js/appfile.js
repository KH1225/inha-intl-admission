'use strict';
/* ===== 입학지원서 PDF (입학지원서 + 자기소개서를 한 파일로) =====
   저장: Supabase Storage 'applications' 버킷 /{지원자ID}/application.pdf + applicant_files 표
   올리기·지우기: 총괄관리자·국제교류팀 / 보기: + 국제교류원장, 학과장(자기 학과)
   면접평가표 인쇄 때 "입학지원서"로 함께 출력 (PDF 각 쪽을 그림으로 바꿔 A4에 배치) */

const AF_BUCKET = 'applications';
const AF_MAX = 20 * 1024 * 1024;
const afPath = id => `${id}/application.pdf`;
const afOf = id => (S.appFiles || {})[id] || null;
const canSeeAppFile = () => ['admin', 'staff', 'director', 'dept'].includes(S.role);

async function loadAppFiles() {
  S.appFiles = {};
  S.appFilesReady = false;
  if (!canSeeAppFile() || !S.apps.length) return;
  try {
    for (const part of chunk(S.apps.map(a => a.id), 100)) {
      const { data, error } = await sb.from('applicant_files').select('applicant_id,path,file_name,size_bytes,uploaded_at').in('applicant_id', part);
      if (error) return; // SQL 적용 전이면 조용히 넘어갑니다
      (data || []).forEach(r => { S.appFiles[r.applicant_id] = r; });
    }
    S.appFilesReady = true;
  } catch (e) { /* 무시 */ }
}
const fmtSize = b => (b == null ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);

/* ---------- 보기 ---------- */
async function viewAppFile(id) {
  const f = afOf(id); if (!f) return;
  const w = window.open('', '_blank'); // 팝업 차단을 피하려고 먼저 창을 엽니다
  const { data, error } = await sb.storage.from(AF_BUCKET).createSignedUrl(f.path, 600);
  if (error || !data) { if (w) w.close(); toast('입학지원서를 열 수 없습니다: ' + errMsg(error), 'err'); return; }
  if (w) w.location = data.signedUrl; else location.href = data.signedUrl;
}
function appFileBtn(id, cls = 'btn sm') {
  return afOf(id) ? `<button class="${cls}" onclick="viewAppFile('${id}')">입학지원서 보기</button>` : '';
}

/* ---------- 올리기 / 지우기 ---------- */
async function uploadAppFile(id, file, quiet) {
  if (!file) return false;
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { toast('PDF 파일만 올릴 수 있습니다.', 'err'); return false; }
  if (file.size > AF_MAX) { toast('20MB 이하 PDF만 올릴 수 있습니다.', 'err'); return false; }
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (String.fromCharCode(...head) !== '%PDF-') { toast(`${file.name}: PDF 파일이 아닙니다.`, 'err'); return false; }
  const path = afPath(id);
  const up = await sb.storage.from(AF_BUCKET).upload(path, file, { upsert: true, contentType: 'application/pdf' });
  if (up.error) { toast(/bucket|not found/i.test(errMsg(up.error)) ? '입학지원서 저장소가 아직 없습니다. 관리자에게 SQL 적용을 요청하세요.' : '업로드 실패: ' + errMsg(up.error), 'err'); return false; }
  const row = { applicant_id: id, path, file_name: file.name.slice(0, 200), size_bytes: file.size, uploaded_by: S.user.id, uploaded_at: new Date().toISOString() };
  const { error } = await sb.from('applicant_files').upsert(row, { onConflict: 'applicant_id' });
  if (error) { toast('업로드 기록 저장 실패: ' + errMsg(error), 'err'); return false; }
  (S.appFiles = S.appFiles || {})[id] = row;
  if (!quiet) toast('입학지원서를 올렸습니다.');
  return true;
}
async function pickAppFile(id) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'application/pdf,.pdf';
  inp.onchange = async () => {
    setBusy(true);
    const ok = await uploadAppFile(id, inp.files[0]);
    setBusy(false);
    if (ok) refreshAppFileSec(id);
  };
  inp.click();
}
async function deleteAppFile(id) {
  const a = S.apps.find(x => x.id === id), f = afOf(id);
  if (!f || !confirm(`${a.name_ko} 지원자의 입학지원서 PDF를 삭제할까요?`)) return;
  setBusy(true);
  const r1 = await sb.storage.from(AF_BUCKET).remove([f.path]);
  const r2 = await sb.from('applicant_files').delete().eq('applicant_id', id);
  setBusy(false);
  if (r1.error || r2.error) { toast(errMsg(r1.error || r2.error), 'err'); return; }
  delete S.appFiles[id];
  toast('삭제했습니다.');
  refreshAppFileSec(id);
}
/* 지원자 상세 화면의 '입학지원서' 칸 */
function appFileSecHtml(a) {
  if (!canSeeAppFile()) return '';
  const f = afOf(a.id);
  const info = f ? `<b>${esc(f.file_name || 'application.pdf')}</b> <span class="muted small">${fmtSize(f.size_bytes)} · ${fmtDateTime(f.uploaded_at)}</span>` : '<span class="muted">아직 올리지 않았습니다.</span>';
  return `<div class="sec" id="sec-appfile"><h3>입학지원서 (PDF) <span class="muted small">입학지원서와 자기소개서를 한 파일로 · 원장·학과장이 면접 때 봅니다</span></h3>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${info}
     <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">${appFileBtn(a.id)}
      ${can.edit() ? `<button class="btn sm ${f ? '' : 'pri'}" onclick="pickAppFile('${a.id}')">${f ? '다른 파일로 바꾸기' : 'PDF 올리기'}</button>${f ? `<button class="btn sm bad" onclick="deleteAppFile('${a.id}')">삭제</button>` : ''}` : ''}</span></div></div>`;
}
function refreshAppFileSec(id) {
  const el = $('#sec-appfile'), a = S.apps.find(x => x.id === id);
  if (el && a) el.outerHTML = appFileSecHtml(a);
  if (S.tab === 'eval' && typeof renderEval === 'function') renderEval();
}

/* ---------- 일괄 올리기 (파일 이름 = 접수번호) ---------- */
function openAppFileBulk() {
  openModal(`${mHead('입학지원서 일괄 올리기', '파일 이름을 접수번호로 맞추면 지원자에게 자동으로 연결됩니다')}
   <div class="m-body">
    <div class="notice small">예: <code>ITC-2027-008.pdf</code>, <code>ITC-2027-008_박막심.pdf</code> → 접수번호 ITC-2027-008 지원자에게 연결. 이미 올린 지원자는 새 파일로 바뀝니다. (파일당 20MB 이하 PDF)</div>
    <input type="file" id="afb-in" accept="application/pdf,.pdf" multiple onchange="afBulkPreview()">
    <div id="afb-list"></div></div>
   <div class="m-foot"><button class="btn" onclick="closeModal(this.closest('.backdrop'))">닫기</button><button class="btn pri" id="afb-go" disabled onclick="afBulkUpload()">올리기</button></div>`, { wide: true, sticky: true });
}
let afBulk = [];
function afBulkPreview() {
  const files = Array.from($('#afb-in').files || []);
  const byNo = Object.fromEntries(S.apps.map(a => [String(a.receipt_no || '').toUpperCase(), a]));
  afBulk = files.map(f => {
    const m = f.name.toUpperCase().match(/[A-Z]+-\d{4}-\d+/);
    const a = m ? byNo[m[0]] : null;
    return { f, a, why: !/\.pdf$/i.test(f.name) ? 'PDF가 아님' : f.size > AF_MAX ? '20MB 초과' : !m ? '파일 이름에 접수번호 없음' : !a ? '해당 접수번호 지원자 없음' : '' };
  });
  const ok = afBulk.filter(x => !x.why).length;
  $('#afb-list').innerHTML = files.length ? `<div class="tbl-wrap" style="max-height:45vh;overflow:auto"><table class="tbl"><thead><tr><th>파일</th><th>연결될 지원자</th><th>상태</th></tr></thead><tbody>
    ${afBulk.map(x => `<tr><td>${esc(x.f.name)} <span class="muted small">${fmtSize(x.f.size)}</span></td><td>${x.a ? `${esc(x.a.receipt_no)} ${esc(x.a.name_ko)}` : '-'}</td>
      <td>${x.why ? `<span style="color:var(--bad)">${esc(x.why)}</span>` : afOf(x.a.id) ? '<span class="pill s-fix">바꾸기</span>' : '<span class="pill s-pass">새로 올림</span>'}</td></tr>`).join('')}</tbody></table></div>
    <div class="muted small" style="margin-top:6px">올릴 수 있는 파일 ${ok}개 / 전체 ${files.length}개</div>` : '';
  $('#afb-go').disabled = !ok;
  $('#afb-go').textContent = ok ? `${ok}개 올리기` : '올리기';
}
async function afBulkUpload() {
  const todo = afBulk.filter(x => !x.why);
  $('#afb-go').disabled = true;
  let n = 0;
  for (const x of todo) {
    $('#afb-go').textContent = `올리는 중… ${n}/${todo.length}`;
    if (await uploadAppFile(x.a.id, x.f, true)) n++;
  }
  toast(`${n}개를 올렸습니다.${n < todo.length ? ` (${todo.length - n}개 실패)` : ''}`, n < todo.length ? 'err' : 'ok');
  closeModal();
  if (S.tab === 'eval') renderEval(); else renderShell();
}

/* ---------- 인쇄: PDF 쪽을 그림으로 ---------- */
const PDFJS = ['https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'];
let pdfjsReady = null;
function loadPdfJs() {
  if (!pdfjsReady) {
    // 작업 스크립트(worker)도 같은 화면에서 실행합니다 (보안 정책상 별도 worker를 쓰지 않음)
    pdfjsReady = PDFJS.reduce((p, src) => p.then(() => new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('PDF 도구를 불러오지 못했습니다.')); document.head.appendChild(s);
    })), Promise.resolve()).then(() => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS[1]; })
      .catch(e => { pdfjsReady = null; throw e; });
  }
  return pdfjsReady;
}
async function appFilePages(id, onPage) {
  await loadPdfJs();
  const f = afOf(id);
  const { data: blob, error } = await sb.storage.from(AF_BUCKET).download(f.path);
  if (error) throw new Error(errMsg(error));
  const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1600 / Math.max(vp1.width, vp1.height));
    const vp = page.getViewport({ scale });
    const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    out.push({ src: cv.toDataURL('image/jpeg', 0.85), land: vp.width > vp.height });
    if (onPage) onPage(i, pdf.numPages);
  }
  await pdf.destroy();
  return out;
}
function appFilePrintHtml(a, pages) {
  return pages.map((p, i) => `<div class="doc sheet af-page">
    <div class="af-head"><b>입학지원서</b><span>${esc(a.receipt_no)} · ${esc(a.name_ko)} ${esc(a.name_en || '')} · ${esc(deptName(a.department_id))}</span><span>${i + 1} / ${pages.length}</span></div>
    <div class="af-img"><img src="${p.src}" alt=""></div></div>`).join('');
}
