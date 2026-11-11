'use strict';
/* ===== 문서 인쇄: 합격통지서 / 등록금고지서 / 등록금납부확인서 ===== */
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const krDate = v => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : ''; };
const enDate = v => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${MONTHS_EN[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : ''; };
const semEn = t => (t.semester === '전기' ? 'Spring' : 'Fall');
const krw = n => (n == null ? '-' : Number(n).toLocaleString('ko-KR') + ' KRW');

const NATION_EN = { 우즈베키스탄: 'Uzbekistan', 일본: 'Japan', 베트남: 'Vietnam', 몽골: 'Mongolia', 키르기스스탄: 'Kyrgyzstan', 러시아: 'Russia', 중국: 'China', 카자흐스탄: 'Kazakhstan', 네팔: 'Nepal', 인도네시아: 'Indonesia', 태국: 'Thailand', 필리핀: 'Philippines', 미얀마: 'Myanmar', 방글라데시: 'Bangladesh', 스리랑카: 'Sri Lanka', 캄보디아: 'Cambodia', 인도: 'India', 파키스탄: 'Pakistan', 타지키스탄: 'Tajikistan', 투르크메니스탄: 'Turkmenistan', 미국: 'United States', 대만: 'Taiwan', 라오스: 'Laos', 말레이시아: 'Malaysia', 싱가포르: 'Singapore', 아프가니스탄: 'Afghanistan', 이란: 'Iran', 튀르키예: 'Turkey', 터키: 'Turkey', 우크라이나: 'Ukraine', 벨라루스: 'Belarus', 아제르바이잔: 'Azerbaijan', 조지아: 'Georgia', 아르메니아: 'Armenia', 이집트: 'Egypt', 나이지리아: 'Nigeria', 가나: 'Ghana', 케냐: 'Kenya', 에티오피아: 'Ethiopia', 브라질: 'Brazil', 캐나다: 'Canada', 호주: 'Australia', 영국: 'United Kingdom', 프랑스: 'France', 독일: 'Germany', 한국: 'Korea' };
function logoOk() {
  return new Promise(res => { const im = new Image(); im.onload = () => res(true); im.onerror = () => res(false); im.src = C.LOGO + '?v=' + Date.now(); });
}
function printHtml(html) {
  const pa = $('#printArea');
  pa.innerHTML = html;
  const imgs = $$('img', pa);
  const wait = Promise.all(imgs.map(im => (im.complete ? Promise.resolve() : new Promise(r => { im.onload = im.onerror = r; }))));
  wait.then(() => setTimeout(() => {
    const clear = () => { pa.innerHTML = ''; window.removeEventListener('afterprint', clear); };
    window.addEventListener('afterprint', clear);
    window.print();
  }, 150));
}
async function sealUrl() {
  try {
    const { data, error } = await sb.storage.from(C.SEAL_BUCKET).createSignedUrl(C.SEAL_FILE, 300);
    return error ? null : data.signedUrl;
  } catch (e) { return null; }
}

function openPrintMenu(id) {
  const a = S.apps.find(x => x.id === id);
  const pay = S.payments[id];
  const passed = ['최종합격', '등록완료'].includes(a.status);
  const btn = (type, ok, why) => `<div style="display:flex;align-items:center;gap:10px;margin:8px 0">
    <button class="btn ${ok ? 'pri' : ''}" style="min-width:180px" ${ok ? '' : 'disabled'} onclick="printDoc('${id}','${type}')">${type} 인쇄</button>
    <span class="muted small">${ok ? '' : esc(why)}</span></div>`;
  openModal(`${mHead('문서 인쇄', `${esc(a.name_ko)} · ${esc(a.receipt_no)} · ${esc(a.status)}`)}<div class="m-body">
   ${btn('합격통지서', passed && can.edit(), '최종합격 이후에 발급할 수 있습니다.')}
   ${btn('등록금고지서', passed && !!pay && can.edit(), pay ? '최종합격 이후에 발급할 수 있습니다.' : '등록금 정보가 없습니다. 최종합격 처리 후 발급하세요.')}
   ${btn('등록금납부확인서', a.status === '등록완료' && !!(pay && pay.paid_at) && can.edit(), '납부일 입력 및 등록완료 처리 후 발급할 수 있습니다.')}
   <div class="muted small" style="margin-top:12px">※ 인쇄할 때마다 발급 기록이 남으며, 같은 문서를 다시 인쇄하면 “재발급”으로 기록됩니다. 인쇄 창에서 “배경 그래픽”을 켜 주세요.</div></div>
   <div class="m-foot"><button class="btn pri" onclick="closeModal(this.closest('.backdrop'))">닫기</button></div>`);
}

async function printDoc(id, type) {
  const a = S.apps.find(x => x.id === id);
  setBusy(true);
  const { data: issued, error } = await sb.rpc('issue_document', { p_applicant: id, p_type: type });
  if (error) { setBusy(false); toast(errMsg(error), 'err'); return; }
  const iss = Array.isArray(issued) ? issued[0] : issued;
  const seal = await sealUrl();
  const hasLogo = await logoOk();
  if (!hasLogo) toast('학교 로고 파일(assets/logo.png)을 찾을 수 없어 로고 없이 인쇄합니다. GitHub의 assets 폴더에 logo.png를 올려 주세요.', 'err');
  setBusy(false);
  closeModal();
  const t = S.term, d = S.deptMap[a.department_id] || {}, q = S.qualMap[a.qualification_code] || {};
  const docNo = iss.doc_no + (iss.reissue_no ? `-R${iss.reissue_no}` : '');
  const issueDate = (iss.issued_at || '').slice(0, 10) || todayYMD();
  const common = { a, t, d, q, docNo, issueDate, seal, hasLogo, pay: S.payments[id] };
  let html = '';
  if (type === '합격통지서') html = docNotice(common);
  else if (type === '등록금고지서') html = docBill(common);
  else html = docReceipt(common);
  printHtml(html);
  toast(`${type}를 발급했습니다. (${docNo})`);
}

/* ---------- 메일 첨부용 PDF ----------
   인쇄용 문서(HTML)를 화면 밖에서 그려 A4 PDF로 만듭니다.
   sample=true 이면 발급 기록 없이 '견본' 번호로 만듭니다 (테스트 발송용). */
const PDF_LIBS = ['https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'];
let pdfLibsReady = null;
function loadPdfLibs() {
  if (!pdfLibsReady) {
    pdfLibsReady = Promise.all(PDF_LIBS.map(src => new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('PDF 도구를 불러오지 못했습니다.')); document.head.appendChild(s);
    }))).catch(e => { pdfLibsReady = null; throw e; });
  }
  return pdfLibsReady;
}
async function toDataUrl(url) {
  try {
    const r = await fetch(url); if (!r.ok) return null;
    const b = await r.blob();
    return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); });
  } catch (e) { return null; }
}
let pdfAssets = null;
async function pdfAssetsOnce() {
  if (!pdfAssets) {
    const [logo, seal] = await Promise.all([toDataUrl(C.LOGO), sealUrl().then(u => (u ? toDataUrl(u) : null))]);
    pdfAssets = { logo, seal };
    setTimeout(() => { pdfAssets = null; }, 10 * 60 * 1000);
  }
  return pdfAssets;
}
async function docPdfBase64(id, type, sample) {
  await loadPdfLibs();
  const a = S.apps.find(x => x.id === id);
  let docNo = '견본 SAMPLE', issueDate = todayYMD();
  if (!sample) {
    const { data: issued, error } = await sb.rpc('issue_document', { p_applicant: id, p_type: type });
    if (error) throw new Error(`${type} 발급 실패: ${errMsg(error)}`);
    const iss = Array.isArray(issued) ? issued[0] : issued;
    docNo = iss.doc_no + (iss.reissue_no ? `-R${iss.reissue_no}` : '');
    issueDate = (iss.issued_at || '').slice(0, 10) || todayYMD();
  }
  const as = await pdfAssetsOnce();
  const c = { a, t: S.term, d: S.deptMap[a.department_id] || {}, q: S.qualMap[a.qualification_code] || {}, docNo, issueDate, seal: as.seal, hasLogo: !!as.logo, pay: S.payments[id] };
  let html = type === '등록금고지서' ? docBill(c) : type === '등록금납부확인서' ? docReceipt(c) : docNotice(c);
  if (as.logo) html = html.split(`src="${esc(C.LOGO)}"`).join(`src="${as.logo}"`);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;background:#fff;z-index:-1';
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    await Promise.all($$('img', host).map(im => (im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; }))));
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const canvas = await window.html2canvas(host.firstElementChild, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
    const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297);
    const b64 = pdf.output('datauristring').split(',')[1];
    return { base64: b64, docNo };
  } finally { host.remove(); }
}

/* ---------- 공통 틀 ---------- */
function docFrame(c, titleKo, titleEn, inner, opts = {}) {
  return `<div class="doc ${opts.cls || ''}"><div class="doc-border">
   ${c.hasLogo ? `<img class="doc-wm" src="${esc(C.LOGO)}" alt=""><img class="doc-logo" src="${esc(C.LOGO)}" alt="">` : ''}
   <div class="doc-no">${opts.noLabel || 'Doc. No.'} ${esc(c.docNo)}</div>
   <div class="doc-title">${titleKo}</div><div class="doc-sub">${titleEn}</div>
   ${inner}
   <div class="doc-spacer"></div>
   <div class="doc-date"><div class="ko">${krDate(c.issueDate)}</div><div class="en">${enDate(c.issueDate)}</div></div>
   <div class="doc-pres"><div class="ko">${esc(C.PRESIDENT_KO)}</div><div class="en">${esc(C.PRESIDENT_EN)}</div>
    ${c.seal ? `<img class="doc-seal" src="${esc(c.seal)}" alt="">` : ''}</div>
</div></div>`;
}
function fieldRows(rows) {
  return `<table class="doc-fields"><tbody>${rows.map(([ko, en, vl, vs]) => `<tr><td class="lb"><span class="lj">${Array.from(ko).map(ch => `<i>${ch}</i>`).join('')}</span><small>${en}</small></td><td class="co">:</td><td class="vl">${vl}${vs ? `<small>${vs}</small>` : ''}</td></tr>`).join('')}</tbody></table>`;
}

/* ---------- 합격통지서 ---------- */
function docNotice(c) {
  const { a, t, d, q } = c;
  const fields = fieldRows([
    ['수험번호', 'Application No.', esc(a.receipt_no)],
    ['이름', 'Name', esc(a.name_ko), esc(a.name_en)],
    ['생년월일', 'Date of Birth', esc(krDate(a.birth_date)), esc(enDate(a.birth_date))],
    ['국적', 'Nationality', esc(a.nationality), esc(NATION_EN[a.nationality] || '')],
    ['학과', 'Department', esc(d.name_ko), esc(d.name_en)],
    ['전형', 'Admission Type', esc(q.name_ko || '외국인 특별전형'), esc(q.name_en || '')]
  ]);
  const body = `<div class="doc-body"><div class="ko">위 사람은 ${esc(C.SCHOOL_KO)}<br>${esc(t.year)}학년도 외국인 특별전형 ${a.admission_kind === '편입학' ? '편입학 ' : ''}모집에<br>합격하였음을 통지합니다.</div>
   <div class="en">This is to certify that the applicant above has been officially admitted to<br>${esc(C.SCHOOL_EN)} for the ${esc(t.year)} Academic Year Special Admissions for<br>International Students.</div></div>`;
  return docFrame(c, '합 격 통 지 서', 'CERTIFICATE OF ADMISSION', fields + body, { cls: 'cert' });
}

/* ---------- 등록금고지서 ---------- */
function docBill(c) {
  const { a, t, d, pay } = c;
  const tuition = pay ? pay.tuition_amount : null, sch = pay ? pay.scholarship_amount : 0;
  const payable = pay ? pay.payable_amount : null;
  const info = `<table class="doc-tbl"><tbody>
   <tr><th>성명<small>Name</small></th><td>${esc(a.name_ko)}<br><small>${esc(a.name_en)}</small></td></tr>
   <tr><th>접수번호<small>Application No.</small></th><td>${esc(a.receipt_no)}</td></tr>
   <tr><th>지원학과<small>Department</small></th><td>${esc(d.name_ko)}<br><small>${esc(d.name_en)}</small></td></tr>
   <tr><th>등록기간<small>Payment Period</small></th><td>${krDate(t.register_start)} ~ ${krDate(t.register_end)}<br><small>${enDate(t.register_start)} – ${enDate(t.register_end)}</small></td></tr></tbody></table>
   <table class="doc-tbl"><tbody>
   <tr><th>등록금<small>Tuition</small></th><td class="amt">${krw(tuition)}</td></tr>
   <tr><th>장학금<small>Scholarship${a.scholarship_type ? ' — ' + esc(a.scholarship_type) : ''}</small></th><td class="amt">${sch ? '- ' + krw(sch) : '-'}</td></tr>
   <tr><th>납부할 금액<small>Amount Due</small></th><td class="amt" style="font-size:14pt">${krw(payable)}</td></tr></tbody></table>
   <table class="doc-tbl"><tbody>
   <tr><th>은행<small>Bank</small></th><td>${esc(t.bank_name)}</td></tr>
   <tr><th>예금주<small>Account Holder</small></th><td>${esc(t.account_holder)}</td></tr>
   <tr><th>계좌번호<small>Account No.</small></th><td>${esc(t.account_no)}</td></tr>
   <tr><th>SWIFT Code</th><td>${esc(t.swift_code)}</td></tr>
   <tr><th>주소<small>Address</small></th><td>${esc(t.bank_address)}</td></tr></tbody></table>
   <div class="doc-notes"><h4>안내 / Notes</h4><ol>${C.NOTICE_LINES.map(n => `<li>${esc(n.ko)}<br><span style="color:#5b6b88">${esc(n.en)}</span></li>`).join('')}</ol></div>`;
  return docFrame(c, '등 록 금 고 지 서', 'TUITION PAYMENT NOTICE', info);
}

/* ---------- 등록금납부확인서 ---------- */
function docReceipt(c) {
  const { a, t, d, pay } = c;
  const fields = fieldRows([
    ['성 명', 'Name', esc(a.name_ko), esc(a.name_en)],
    ['생년월일', 'Date of Birth', esc(krDate(a.birth_date)), esc(enDate(a.birth_date))],
    ['국 적', 'Nationality', esc(a.nationality)],
    ['학 과', 'Department', esc(d.name_ko), esc(d.name_en)],
    ['납부 금액', 'Amount Paid', esc(krw(pay && pay.paid_amount != null ? pay.paid_amount : (pay && pay.payable_amount))), ''],
    ['납부일', 'Date of Payment', esc(krDate(pay && pay.paid_at)), esc(enDate(pay && pay.paid_at))]
  ]);
  const body = `<div class="doc-body"><div class="ko">위 사람은 ${esc(C.SCHOOL_KO)} ${esc(t.year)}학년도 ${esc(t.semester)} 등록금을<br>위와 같이 납부하였음을 확인합니다.</div>
   <div class="en">This is to certify that the above-named student has paid the tuition fee<br>for the ${semEn(t)} Semester of Academic Year ${esc(t.year)} at ${esc(C.SCHOOL_EN)}<br>as stated above.</div></div>`;
  return docFrame(c, '등록금 납부 확인서', 'CERTIFICATE OF TUITION PAYMENT', fields + body);
}
