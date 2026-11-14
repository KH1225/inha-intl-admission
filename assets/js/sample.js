'use strict';
/* ===== 테스트용 샘플 지원자 (총괄관리자) =====
   접수번호 SAMPLE-학년도-01/02, 이름 앞에 [샘플]
   - 현황판 통계(카드·그래프)에서는 빠지고, 목록에는 '샘플' 표시와 함께 나옵니다.
   - '샘플 모두 삭제'는 DB 함수 delete_sample_applicants 로 모든 기록을 함께 지웁니다. */

const SAMPLE_PREFIX = 'SAMPLE-';
const isSample = a => String((a && a.receipt_no) || '').startsWith(SAMPLE_PREFIX);
const SAMPLE_EMAIL = 'oia@inhatc.ac.kr'; // 테스트 메일이 국제교류팀 메일함으로 오도록

function sampleDept(names) {
  const norm = s => String(s || '').replace(/\s/g, '');
  for (const n of names) { const d = S.depts.find(x => x.active !== false && norm(x.name_ko) === norm(n)); if (d) return d.id; }
  const d = S.depts.find(x => x.active !== false && x.program_type !== '전공심화') || S.depts[0];
  return d ? d.id : null;
}

function openSampleModal() {
  const list = S.apps.filter(isSample);
  openModal(`${mHead('테스트용 샘플 데이터', '실제 지원자 대신 샘플로 기능을 시험해 보세요')}
   <div class="m-body">
    <div class="notice small">샘플 지원자는 접수번호가 <b>${SAMPLE_PREFIX}</b>로 시작하고 이름 앞에 <b>[샘플]</b>이 붙습니다.
      현황판 통계에서는 빠지고, 안내 메일은 <b>${esc(SAMPLE_EMAIL)}</b>로 갑니다. 테스트가 끝나면 아래 ‘샘플 모두 삭제’로 기록까지 깨끗이 지우세요.</div>
    <div class="sec"><h3>현재 샘플 ${list.length}명</h3>
     ${list.length ? `<ul style="margin:0;padding-left:18px">${list.map(a => `<li>${esc(a.receipt_no)} · ${esc(a.name_ko)} · ${esc(a.admission_kind)} · ${esc(deptName(a.department_id))} · <span class="pill ${STATUS_CLS[a.status]}">${esc(a.status)}</span></li>`).join('')}</ul>` : '<div class="muted">없습니다.</div>'}</div>
    <div class="muted small">삭제되는 것: 샘플 지원자 정보, 사진, 서류 체크, 면접 순서·평가·서명, 납부 정보, 문서 발급 이력, 상태 변경 이력, 메일 발송 기록</div></div>
   <div class="m-foot"><button class="btn" onclick="closeModal(this.closest('.backdrop'))">닫기</button>
    ${list.length ? '<button class="btn bad" onclick="deleteSamples()">샘플 모두 삭제</button>' : ''}
    <button class="btn pri" onclick="createSamples()" ${list.length >= 2 ? 'disabled title="이미 샘플이 있습니다"' : ''}>샘플 2명 만들기</button></div>`, { sticky: true });
}

async function createSamples() {
  const y = S.term.year || new Date().getFullYear() + 1;
  const have = new Set(S.apps.filter(isSample).map(a => a.receipt_no));
  const rows = [
    { receipt_no: `${SAMPLE_PREFIX}${y}-01`, name_ko: '[샘플] 김 테스트', name_en: 'SAMPLE KIM TEST', gender: '남', birth_date: '2006-03-15', nationality: '우즈베키스탄',
      admission_kind: '신입학', transfer_year: null, department_id: sampleDept(['항공운항과']), qualification_code: 'T1', route: '개별지원',
      topik_level: 3, visa_type: 'D-4', high_school: 'Sample High School (Tashkent)', memo: '테스트용 샘플 지원자' },
    { receipt_no: `${SAMPLE_PREFIX}${y}-02`, name_ko: '[샘플] 이 테스트', name_en: 'SAMPLE LEE TEST', gender: '여', birth_date: '2004-08-20', nationality: '베트남',
      admission_kind: '편입학', transfer_year: 2, department_id: sampleDept(['항공경영학과', '항공운항과']), qualification_code: 'T2', route: '개별지원',
      topik_level: 4, visa_type: 'D-2', high_school: 'Sample High School (Hanoi)', memo: '테스트용 샘플 지원자' }
  ].filter(r => !have.has(r.receipt_no))
   .map(r => ({ ...r, term_id: S.term.id, email: SAMPLE_EMAIL, phone: '010-0000-0000', status: '서류심사', dorm_application: false }));
  if (!rows.length) { toast('이미 샘플 2명이 있습니다.'); return; }
  setBusy(true);
  for (const r of rows) {
    const { error } = await sb.from('applicants').insert(r);
    if (error) { setBusy(false); toast(`샘플 만들기 실패: ${errMsg(error)}`, 'err'); await reloadAndRender(); return; }
  }
  if (typeof syncScholarships === 'function') await syncScholarships();
  setBusy(false);
  toast(`샘플 ${rows.length}명을 만들었습니다.`);
  closeModal(); await reloadAndRender();
}

async function deleteSamples() {
  const list = S.apps.filter(isSample);
  if (!list.length) return;
  if (!confirm(`샘플 지원자 ${list.length}명과 그 모든 기록을 삭제합니다. (실제 지원자는 지워지지 않습니다)\n계속할까요?`)) return;
  setBusy(true);
  // 저장소 파일(사진) 먼저 정리 — 실패해도 계속
  try {
    const photos = list.map(a => a.photo_path).filter(Boolean);
    if (photos.length) await sb.storage.from('photos').remove(photos);
  } catch (e) { /* 무시 */ }
  const { data, error } = await sb.rpc('delete_sample_applicants');
  setBusy(false);
  if (error) {
    toast(/delete_sample_applicants|function/i.test(errMsg(error)) ? '샘플 삭제 기능이 DB에 아직 없습니다. sql/2026-11-11_샘플데이터_삭제함수.sql 을 실행해 주세요.' : errMsg(error), 'err');
    return;
  }
  toast(`샘플 ${data || 0}명과 모든 기록을 삭제했습니다.`);
  closeModal(); await reloadAndRender();
}
