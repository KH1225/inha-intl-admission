'use strict';
/* ===== 학점 인정 심사: 전적교 성적증명서 파일 =====
   저장: Supabase Storage 'applications' 버킷 /{지원자ID}/transcript-{시각}.{pdf|jpg|png} + credit_transcripts 표
   올리기·지우기: 총괄관리자·국제교류팀 / 보기: + 국제교류원장, 학과장(자기 학과) — 입학지원서 PDF와 같은 권한
   한 학생당 여러 파일(최대 5개, 사진 여러 장도 가능) */

const TR_MAX = 20 * 1024 * 1024, TR_LIMIT = 5;
const TR_TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
const trOf = id => (S.transcripts || {})[id] || [];

async function loadTranscripts() {
  S.transcripts = {}; S.trReady = false;
  if (!canSeeCredit()) return;
  const ids = S.apps.filter(a => a.admission_kind === '편입학').map(a => a.id);
  try {
    if (!ids.length) { const t = await sb.from('credit_transcripts').select('id').limit(1); S.trReady = !t.error; return; }
    for (const part of chunk(ids, 100)) {
      const { data, error } = await sb.from('credit_transcripts').select('*').in('applicant_id', part).order('uploaded_at');
      if (error) return; // SQL 적용 전
      (data || []).forEach(r => { (S.transcripts[r.applicant_id] = S.transcripts[r.applicant_id] || []).push(r); });
    }
    S.trReady = true;
  } catch (e) { /* 무시 */ }
}

function trSecHtml(a) {
  const files = trOf(a.id), canUp = can.edit() && S.role !== 'dept';
  const list = files.map((f, i) => `<span class="tr-file"><button class="btn sm blue" onclick="viewTranscript('${a.id}',${i})">📄 ${esc(f.file_name || '성적증명서')}</button>
      <span class="muted small">${fmtSize(f.size_bytes)}</span>${canUp ? ` <button class="btn sm" title="삭제" onclick="deleteTranscript('${a.id}',${i})">✕</button>` : ''}</span>`).join('');
  let tail = '';
  if (!S.trReady) tail = canUp ? '<span class="muted small">성적증명서 저장 공간이 아직 없습니다 — sql/2026-11-12_성적증명서_업로드.sql 실행 필요</span>' : '';
  else if (canUp) tail = files.length < TR_LIMIT ? `<button class="btn sm" onclick="pickTranscript('${a.id}')">＋ 성적증명서 올리기</button><span class="muted small">PDF·JPG·PNG, 20MB 이하, 최대 ${TR_LIMIT}개</span>` : '';
  if (!files.length && !tail) tail = '<span class="muted small">올린 성적증명서가 없습니다</span>';
  return `<div class="tr-sec" id="crt-${a.id}"><b class="small">성적증명서</b>${list}${tail}</div>`;
}
function refreshTranscriptSec(id) {
  const el = $(`#crt-${id}`), a = S.apps.find(x => x.id === id);
  if (el && a) el.outerHTML = trSecHtml(a);
}

async function viewTranscript(id, i) {
  const f = trOf(id)[i]; if (!f) return;
  const w = window.open('', '_blank');
  const { data, error } = await sb.storage.from('applications').createSignedUrl(f.path, 600);
  if (error || !data) { if (w) w.close(); toast('성적증명서를 열 수 없습니다: ' + errMsg(error), 'err'); return; }
  if (w) w.location = data.signedUrl; else location.href = data.signedUrl;
}

function pickTranscript(id) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.multiple = true; inp.accept = 'application/pdf,.pdf,image/jpeg,image/png,.jpg,.jpeg,.png';
  inp.onchange = async () => {
    const files = [...inp.files], room = TR_LIMIT - trOf(id).length;
    if (files.length > room) toast(`최대 ${TR_LIMIT}개까지 올릴 수 있어 앞의 ${room}개만 올립니다.`, 'err');
    setBusy(true);
    let n = 0;
    for (const f of files.slice(0, room)) if (await uploadTranscript(id, f)) n++;
    setBusy(false);
    if (n) toast(`성적증명서 ${n}개를 올렸습니다.`);
    refreshTranscriptSec(id);
  };
  inp.click();
}
async function uploadTranscript(id, file) {
  let type = file.type;
  if (!TR_TYPES[type]) type = /\.pdf$/i.test(file.name) ? 'application/pdf' : /\.jpe?g$/i.test(file.name) ? 'image/jpeg' : /\.png$/i.test(file.name) ? 'image/png' : '';
  if (!type) { toast(`${file.name}: PDF·JPG·PNG 파일만 올릴 수 있습니다.`, 'err'); return false; }
  if (file.size > TR_MAX) { toast(`${file.name}: 20MB 이하만 올릴 수 있습니다.`, 'err'); return false; }
  const h = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const ok = type === 'application/pdf' ? String.fromCharCode(...h.slice(0, 5)) === '%PDF-'
    : type === 'image/png' ? h[0] === 0x89 && h[1] === 0x50 : h[0] === 0xFF && h[1] === 0xD8;
  if (!ok) { toast(`${file.name}: 파일 내용이 확장자와 맞지 않습니다.`, 'err'); return false; }
  const path = `${id}/transcript-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${TR_TYPES[type]}`;
  const up = await sb.storage.from('applications').upload(path, file, { contentType: type });
  if (up.error) {
    toast(/mime|type/i.test(errMsg(up.error)) ? '사진 파일을 받을 수 있게 sql/2026-11-12_성적증명서_업로드.sql 을 실행해 주세요.' : `업로드 실패: ${errMsg(up.error)}`, 'err');
    return false;
  }
  const row = { applicant_id: id, path, file_name: file.name.slice(0, 200), mime: type, size_bytes: file.size, uploaded_by: S.user.id };
  const { data, error } = await sb.from('credit_transcripts').insert(row).select().single();
  if (error) { await sb.storage.from('applications').remove([path]); toast('업로드 기록 저장 실패: ' + errMsg(error), 'err'); return false; }
  (S.transcripts[id] = S.transcripts[id] || []).push(data || { ...row, uploaded_at: new Date().toISOString() });
  return true;
}
async function deleteTranscript(id, i) {
  const f = trOf(id)[i], a = S.apps.find(x => x.id === id);
  if (!f || !confirm(`${a ? a.name_ko : ''} 학생의 성적증명서 「${f.file_name}」을 삭제할까요?`)) return;
  setBusy(true);
  const r1 = await sb.storage.from('applications').remove([f.path]);
  const r2 = f.id != null ? await sb.from('credit_transcripts').delete().eq('id', f.id) : await sb.from('credit_transcripts').delete().eq('path', f.path);
  setBusy(false);
  if (r1.error || r2.error) { toast(errMsg(r1.error || r2.error), 'err'); return; }
  S.transcripts[id] = trOf(id).filter(x => x !== f);
  toast('삭제했습니다.');
  refreshTranscriptSec(id);
}
