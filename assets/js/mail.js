'use strict';
/* ===== 지원자 안내 메일 일괄 발송 (총괄관리자 / 국제교류팀) =====
   면접안내 / 합격등록안내 / 입금확인 / OT안내
   실제 발송은 Supabase 서버 함수 send-interview-mail 이 합니다.
   받는 사람은 DB에 저장된 지원자 이메일만 쓰이고, {이름}·{등록금} 등은 서버가 DB 값으로 채웁니다. */

const MAIL_FN = 'send-interview-mail';
const MAIL_CHUNK = 20;
const MAIL_CONTACT_KO = '문의: 인하공업전문대학 국제교류팀 (oia@inhatc.ac.kr / +82-328702086)';
const MAIL_CONTACT_EN = 'Contact: International Affairs Team, Inha Technical College (oia@inhatc.ac.kr / +82-328702086)';
const MAIL_SEP = '\n\n----------------------------------------\n\n';

const MAIL_KINDS = {
  면접안내: {
    label: '면접 안내',
    desc: '면접심사 단계 지원자에게 면접 일시·순서·Zoom 주소를 안내합니다.',
    targets: () => S.apps.filter(a => a.status === '면접심사' || (S.interviews[a.id] && !['불합격', '접수취소'].includes(a.status))),
    zoom: true,
    info: a => { const iv = S.interviews[a.id] || {}; return iv.scheduled_at ? fmtDateTime(iv.scheduled_at) : '<span style="color:var(--warn)">면접일시 미정</span>'; },
    vars: ['이름', '영문이름', '접수번호', '학과', '면접일시', '면접일시_영문', '면접순서', '면접순서_영문', '줌주소'],
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
- Zoom 표시 이름은 영문이름("{영문이름}")으로 설정해 주세요.
- 본인 확인을 위해 여권을 준비해 주세요.
- 카메라와 마이크를 켠 상태로 참여해야 합니다.

${MAIL_CONTACT_KO}${MAIL_SEP}Dear {영문이름},

This is the International Affairs Team of Inha Technical College.
Congratulations on passing the document screening. Your online interview (Zoom) is scheduled as follows.

■ Application No.: {접수번호}
■ Department: {학과}
■ Date & Time: {면접일시_영문}
■ Interview Order: {면접순서_영문}
■ Zoom Link: {줌주소}

[Notes]
- Please join the Zoom meeting at least 10 minutes before your interview.
- Set your Zoom display name to your English name ("{영문이름}").
- Please have your passport ready for identity verification.
- Your camera and microphone must be turned on.

${MAIL_CONTACT_EN}`
  },
  합격등록안내: {
    label: '합격자 등록 안내',
    desc: '최종합격자에게 합격 축하와 등록금·장학금·납부계좌·등록기간을 안내합니다. (금액은 지원자별 등록금고지서 값)',
    targets: () => S.apps.filter(a => ['최종합격', '등록완료'].includes(a.status)),
    defaultOn: a => a.status === '최종합격',
    attach: [
      { type: '합격통지서', label: '합격통지서', file: 'Admission_Letter', can: a => (['최종합격', '등록완료'].includes(a.status) ? null : '최종합격자가 아닙니다') },
      { type: '등록금고지서', label: '등록금고지서', file: 'Tuition_Invoice', can: a => (S.payments[a.id] ? null : '등록금 정보(고지 금액)가 없습니다') }
    ],
    info: a => { const p = S.payments[a.id]; return p ? `납부할 금액 ${won(p.payable_amount)}` : '<span style="color:var(--warn)">고지 금액 없음</span>'; },
    vars: ['이름', '영문이름', '접수번호', '학과', '학기', '등록금', '등록금_영문', '장학금종류', '장학금종류_영문', '장학금', '장학금_영문', '납부금액', '납부금액_영문', '등록기간', '등록기간_영문', '은행명', '예금주', '계좌번호', 'SWIFT', '은행주소', '입학일', '입학일_영문'],
    subject: '[인하공업전문대학] 최종 합격 및 등록 안내 / Admission & Registration Notice - {영문이름}',
    body: `{이름}({영문이름}) 님, 안녕하세요.
인하공업전문대학 국제교류팀입니다.
{학기} 외국인 특별전형에 최종 합격하신 것을 진심으로 축하드립니다.
첨부한 합격통지서와 등록금고지서를 확인하시고, 아래 등록기간 내에 등록금을 납부하여 등록을 완료해 주세요.

■ 접수번호: {접수번호}
■ 합격학과: {학과}
■ 등록금: {등록금}
■ 장학금: {장학금종류} ({장학금})
■ 납부할 금액: {납부금액}
■ 등록기간: {등록기간}
■ 입학일: {입학일}

[납부 계좌 (해외송금)]
- 은행: {은행명}
- 예금주: {예금주}
- 계좌번호: {계좌번호}
- SWIFT 코드: {SWIFT}
- 주소: {은행주소}

[유의사항]
- 송금인(Sender) 란에 지원자의 영문 성명을 정확히 기재해 주세요.
- 송금 수수료는 송금인이 부담하며, 학교에서 수령하는 금액이 납부할 금액과 일치해야 합니다.
- 해외 송금으로 인하여 차액 발생시, 초과 송금한 경우에는 입학 후 환불해 드리고, 부족 송금한 경우에는 입학 전 오리엔테이션 당일에 현금 납부해 주셔야 합니다.
- 유학(D-2) 비자가 필요한 경우 표준입학허가서 발급을 위해 재정능력 입증서류(잔고증명서) 원본을 기한 내에 제출해야 합니다.
- 기간 내에 납부하지 않으면 합격이 취소될 수 있습니다.

${MAIL_CONTACT_KO}${MAIL_SEP}Dear {영문이름},

This is the International Affairs Team of Inha Technical College.
Congratulations! You have been admitted to Inha Technical College ({학기}).
Please check the attached Certificate of Admission and tuition invoice, and complete your registration by paying the tuition within the payment period below.

■ Application No.: {접수번호}
■ Department: {학과}
■ Tuition: {등록금_영문}
■ Scholarship: {장학금종류_영문} ({장학금_영문})
■ Amount Due: {납부금액_영문}
■ Payment Period: {등록기간_영문}
■ Entrance Date: {입학일_영문}

[Bank Account (Overseas Remittance)]
- Bank: {은행명}
- Account Holder: {예금주}
- Account No.: {계좌번호}
- SWIFT Code: {SWIFT}
- Address: {은행주소}

[Notes]
- Please write your full English name in the sender field.
- Bank charges are borne by the sender; the amount received by the college must equal the amount due.
- If the amount received differs due to overseas remittance, any overpayment will be refunded after admission, and any shortfall must be paid in cash on the day of the orientation before admission.
- If you need a student (D-2) visa, please submit the original bank balance certificate for your Certificate of Admission.
- Admission may be cancelled if the tuition is not paid within the period.

${MAIL_CONTACT_EN}`
  },
  입금확인: {
    label: '등록금 입금 확인',
    desc: '납부일이 입력된 지원자에게 등록금 입금이 확인되었음을 안내합니다.',
    targets: () => S.apps.filter(a => S.payments[a.id] && S.payments[a.id].paid_at),
    attach: [{ type: '등록금납부확인서', label: '등록금 수납(납부)확인서', file: 'Tuition_Payment_Certificate', can: a => (a.status === '등록완료' ? null : '등록완료 처리 후 발급할 수 있습니다') }],
    info: a => { const p = S.payments[a.id] || {}, d = p.paid_amount != null && p.payable_amount != null ? Number(p.paid_amount) - Number(p.payable_amount) : 0;
      return `${won(p.paid_amount)} · ${esc(p.paid_at || '')}${d > 0 ? ` <span style="color:var(--pri2)">초과 ${won(d)}</span>` : d < 0 ? ` <span style="color:var(--bad)">부족 ${won(-d)}</span>` : ''}`; },
    vars: ['이름', '영문이름', '접수번호', '학과', '학기', '납입금액', '납입금액_영문', '납부일', '납부일_영문', '입학일', '입학일_영문', '차액안내', '차액안내_영문'],
    subject: '[인하공업전문대학] 등록금 입금 확인 / Tuition Payment Confirmation - {영문이름}',
    body: `{이름}({영문이름}) 님, 안녕하세요.
인하공업전문대학 국제교류팀입니다.
아래와 같이 등록금 입금이 확인되었습니다.

■ 접수번호: {접수번호}
■ 학과: {학과}
■ 입금액: {납입금액}
■ 입금 확인일: {납부일}
■ 입학일: {입학일}

{차액안내}

등록금 수납(납부)확인서를 첨부하오니 확인해 주세요.
오리엔테이션 등 입학 관련 안내는 추후 별도로 보내드리겠습니다.

${MAIL_CONTACT_KO}${MAIL_SEP}Dear {영문이름},

This is the International Affairs Team of Inha Technical College.
We have confirmed your tuition payment as follows.

■ Application No.: {접수번호}
■ Department: {학과}
■ Amount Received: {납입금액_영문}
■ Date Confirmed: {납부일_영문}
■ Entrance Date: {입학일_영문}

{차액안내_영문}

Please find the attached Certificate of Tuition Payment.
We will send you further information, including the orientation schedule, separately.

${MAIL_CONTACT_EN}`
  },
  기숙사안내: {
    label: '기숙사 신청 안내',
    desc: '합격자에게 기숙사 정보와 신청 방법을 안내하고, 지원자 정보에 기록된 기숙사 신청 여부를 확인하도록 합니다. (아래 안내 항목은 모두에게 같은 내용)',
    targets: () => S.apps.filter(a => ['최종합격', '등록완료'].includes(a.status)),
    info: a => (a.dorm_application ? `<span class="pill s-pass">기숙사 신청</span>${dormRoom(a.dorm_room) ? ` <span class="small">${esc(dormRoom(a.dorm_room).ko)}</span>` : ''}` : '<span class="pill s-cancel">미신청</span>'),
    extras: [['신청마감', '신청 마감일', '예: 2026년 12월 20일(일) / December 20, 2026'], ['입사일', '입사일', '예: 2027년 2월 26일(금) / February 26, 2027']],
    vars: ['이름', '영문이름', '접수번호', '학과', '학기', '기숙사신청', '기숙사신청_영문', '입학일', '입학일_영문', '신청마감', '입사일'],
    subject: '[인하공업전문대학] 기숙사 신청 안내 / Dormitory Application - {영문이름}',
    body: `{이름}({영문이름}) 님, 안녕하세요.
인하공업전문대학 국제교류팀입니다.
신입 유학생 기숙사 신청을 아래와 같이 안내드립니다.

■ 현재 기숙사 신청 여부: {기숙사신청}
■ 신청 마감일: {신청마감}
■ 입사일: {입사일}

[객실 유형 및 생활관비]
※ 2인실 A는 개별 욕실, 2인실 B·3인실·4인실은 공용 욕실입니다.

▶ 16주
- 2인실 A (개별 욕실): 1,408,000원
- 2인실 B (공용 욕실): 1,200,000원
- 3인실 (공용 욕실): 1,008,000원
- 4인실 (공용 욕실): 800,000원

▶ 24주 (생활관비 5% 감면)
- 2인실 A (개별 욕실): 2,112,000원 → 납부금액 2,006,000원
- 2인실 B (공용 욕실): 1,800,000원 → 납부금액 1,710,000원
- 3인실 (공용 욕실): 1,512,000원 → 납부금액 1,436,000원
- 4인실 (공용 욕실): 1,200,000원 → 납부금액 1,140,000원

[기숙사 신청서 — 회신용]
희망하는 기간과 객실유형을 체크하여 메일로 회신 주시면 됩니다.
(이 메일에 ‘답장’을 누르고, 원하는 항목의 ☐ 를 ☑ 또는 V 로 바꿔 보내 주세요.)

● 기간:  ☐ 16주   ☐ 24주
● 객실유형:
   ☐ 2인실 A (개별 욕실)
   ☐ 2인실 B (공용 욕실)
   ☐ 3인실 (공용 욕실)
   ☐ 4인실 (공용 욕실)
● ☐ 기숙사를 신청하지 않습니다.

신청 마감일 이후에는 기숙사 배정이 어렵습니다. 반드시 신청 마감일({신청마감})까지 메일을 회신해 주세요.

${MAIL_CONTACT_KO}${MAIL_SEP}Dear {영문이름},

This is the International Affairs Team of Inha Technical College.
Please find the dormitory application information for new international students below.

■ Your current dormitory application status: {기숙사신청_영문}
■ Application deadline: {신청마감}
■ Move-in date: {입사일}

[Room Types and Dormitory Fees]
* Double Room A has a private bathroom. Double Room B, Triple and Quad rooms share a common bathroom.

▶ 16 weeks
- Double Room A (private bathroom): KRW 1,408,000
- Double Room B (shared bathroom): KRW 1,200,000
- Triple Room (shared bathroom): KRW 1,008,000
- Quad Room (shared bathroom): KRW 800,000

▶ 24 weeks (5% discount)
- Double Room A (private bathroom): KRW 2,112,000 → Amount due KRW 2,006,000
- Double Room B (shared bathroom): KRW 1,800,000 → Amount due KRW 1,710,000
- Triple Room (shared bathroom): KRW 1,512,000 → Amount due KRW 1,436,000
- Quad Room (shared bathroom): KRW 1,200,000 → Amount due KRW 1,140,000

[Dormitory Application — Please Reply]
Please check your preferred period and room type and reply to this email.
(Click 'Reply', change ☐ to ☑ or V for the items you want, and send.)

● Period:  ☐ 16 weeks   ☐ 24 weeks
● Room type:
   ☐ Double Room A (private bathroom)
   ☐ Double Room B (shared bathroom)
   ☐ Triple Room (shared bathroom)
   ☐ Quad Room (shared bathroom)
● ☐ I do not wish to apply for the dormitory.

Dormitory placement is difficult after the application deadline. Please be sure to reply to this email by the deadline ({신청마감}).

${MAIL_CONTACT_EN}`
  },
  OT안내: {
    label: '오리엔테이션 안내',
    desc: '등록완료자에게 신입생 오리엔테이션 일시·장소·준비물을 안내합니다. (아래 항목은 모두에게 같은 내용)',
    targets: () => S.apps.filter(a => a.status === '등록완료'),
    info: () => '',
    extras: [['OT일시', '오리엔테이션 일시', '예: 2027년 2월 24일(수) 10:00 / Feb 24, 2027 10:00'], ['OT장소', '장소', '예: 본관 2층 대강당 / Main Building Auditorium (2F)'], ['준비물', '준비물', '예: 여권, 외국인등록증(소지자), 필기구 / Passport, ARC, pen']],
    fees: true,
    vars: ['이름', '영문이름', '접수번호', '학기', '입학일', '입학일_영문', 'OT일시', 'OT장소', '준비물', '납부비용', '납부비용_영문'],
    subject: '[인하공업전문대학] 신입생 오리엔테이션 안내 / New Student Orientation - {영문이름}',
    body: `{이름}({영문이름}) 님, 안녕하세요.
인하공업전문대학 국제교류팀입니다.
입학을 진심으로 환영합니다. 신입 유학생 오리엔테이션을 아래와 같이 안내드립니다.

■ 일시: {OT일시}
■ 장소: {OT장소}
■ 준비물: {준비물}
■ 입학일: {입학일}

{납부비용}

오리엔테이션에서는 학사 일정, 수강신청, 비자·외국인등록, 기숙사 및 학교생활 안내가 진행됩니다.
신입 유학생은 반드시 참석해 주세요.

${MAIL_CONTACT_KO}${MAIL_SEP}Dear {영문이름},

This is the International Affairs Team of Inha Technical College.
Welcome to Inha Technical College! Please attend the orientation for new international students.

■ Date & Time: {OT일시}
■ Place: {OT장소}
■ What to bring: {준비물}
■ Entrance Date: {입학일_영문}

{납부비용_영문}

The orientation covers the academic calendar, course registration, visa and alien registration, dormitory and campus life.
Attendance is mandatory for all new international students.

${MAIL_CONTACT_EN}`
  }
};

let mailKind = '면접안내', mailLogs = {};
const mailKey = k => `mailTpl:${S.term ? S.term.id : ''}:${k}`;
/* 예전에 저장해 둔 안내문에 남아 있는 옛 문구를 새 문구로 바꿉니다 (직접 고친 다른 내용은 그대로) */
const MAIL_UPGRADES = [
  ['송금인(Sender) 란에 지원자의 영문 성명과 접수번호를 정확히 기재해 주세요.', '송금인(Sender) 란에 지원자의 영문 성명을 정확히 기재해 주세요.'],
  ['Please write your full English name and application number in the sender field.', 'Please write your full English name in the sender field.'],
  ['Zoom 표시 이름은 "접수번호_영문이름"으로 설정해 주세요.', 'Zoom 표시 이름은 영문이름("{영문이름}")으로 설정해 주세요.'],
  ['Set your Zoom display name to "ApplicationNo_EnglishName".', 'Set your Zoom display name to your English name ("{영문이름}").'],
  ['문의: 인하공업전문대학 국제교류팀 (본관 412호)', MAIL_CONTACT_KO],
  ['Contact: International Affairs Team, Inha Technical College (Main Building Room 412)', MAIL_CONTACT_EN],
  ['첨부한 등록금고지서를 확인하시고,', '첨부한 합격통지서와 등록금고지서를 확인하시고,'],
  ['■ 준비물: {준비물}\n■ 학과: {학과}\n', '■ 준비물: {준비물}\n'],
  ['■ What to bring: {준비물}\n■ Department: {학과}\n', '■ What to bring: {준비물}\n'],
  ['■ 입학일: {입학일}\n\n오리엔테이션에서는', '■ 입학일: {입학일}\n\n{납부비용}\n\n오리엔테이션에서는'],
  ['■ Entrance Date: {입학일_영문}\n\nThe orientation covers', '■ Entrance Date: {입학일_영문}\n\n{납부비용_영문}\n\nThe orientation covers'],
  ['Please check the attached tuition invoice and complete', 'Please check the attached Certificate of Admission and tuition invoice, and complete'],
  ['현재 신청 여부가 본인의 희망과 다르거나 변경을 원하면, 신청 마감일까지 국제교류팀으로 알려 주세요.\n기숙사 배정은 신청 인원에 따라 달라질 수 있습니다.', '신청 마감일 이후에는 기숙사 배정이 어렵습니다. 반드시 신청 마감일({신청마감})까지 메일을 회신해 주세요.'],
  ['If your current status is not what you want, or if you wish to change it, please contact the International Affairs Team by the application deadline.\nRoom assignment may vary depending on the number of applicants.', 'Dormitory placement is difficult after the application deadline. Please be sure to reply to this email by the deadline ({신청마감}).']
];
function mailUpgrade(t) { return typeof t === 'string' ? MAIL_UPGRADES.reduce((x, [o, n]) => x.split(o).join(n), t) : t; }
function mailSaved(k) {
  try {
    const sv = JSON.parse(localStorage.getItem(mailKey(k)) || 'null') || {};
    if (sv.body) sv.body = mailUpgrade(sv.body);
    if (sv.subject) sv.subject = mailUpgrade(sv.subject);
    return sv;
  } catch (e) { return {}; }
}
function mailRemember(k, o) { try { localStorage.setItem(mailKey(k), JSON.stringify(o)); } catch (e) { /* 무시 */ } }
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
const zoomOk = u => !u || /^https:\/\/[^\s"'<>]+$/.test(u);
function mailTargets(k = mailKind) {
  return MAIL_KINDS[k].targets().filter(a => a.status !== '접수취소')
    .sort((x, y) => { const ox = orderOf(x), oy = orderOf(y); if (ox != null && oy != null && ox !== oy) return ox - oy; if ((ox == null) !== (oy == null)) return ox == null ? 1 : -1; return String(x.receipt_no).localeCompare(String(y.receipt_no)); });
}

async function openMailModal(kind) {
  if (kind) mailKind = kind;
  const K = MAIL_KINDS[mailKind], list = mailTargets();
  mailLogs = {};
  try {
    for (const part of chunk(list.map(a => a.id), 100)) {
      const { data, error } = await sb.from('mail_logs').select('applicant_id,sent_at,ok').in('applicant_id', part).eq('kind', mailKind).order('sent_at');
      if (error) break;
      (data || []).forEach(r => { if (r.ok) mailLogs[r.applicant_id] = r.sent_at; });
    }
  } catch (e) { /* 기록 테이블이 없어도 화면은 엽니다 */ }
  const sv = mailSaved(mailKind);
  const depts = [...new Set(list.map(a => a.department_id))].map(id => ({ id, name: deptName(id) })).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const hasCc = !!(S.hasCol && S.hasCol.cc_emails);
  const rows = list.map(a => {
    const ok = emailOk(a.email), sent = mailLogs[a.id], on = ok && !sent && (!K.defaultOn || K.defaultOn(a));
    return `<tr><td><input type="checkbox" class="ml-ck" data-id="${a.id}" ${on ? 'checked' : ''} ${ok ? '' : 'disabled'} onchange="mailCount()" style="width:auto"></td>
      <td class="nw">${esc(a.receipt_no)}</td><td>${esc(a.name_ko)}<div class="muted small">${esc(a.name_en)}</div></td>
      <td>${esc(deptName(a.department_id))}</td><td class="nw"><span class="pill ${STATUS_CLS[a.status]}">${esc(a.status)}</span></td>
      <td>${ok ? esc(a.email) : '<span style="color:var(--bad)">이메일 없음</span>'}</td>
      ${hasCc ? `<td><input class="ml-cc" data-id="${a.id}" value="${esc(a.cc_emails || '')}" placeholder="보호자·유학원 이메일" style="min-width:190px;padding:5px 7px;font-size:12px"></td>` : ''}
      <td class="nw small">${K.info(a)}</td>
      <td class="nw">${sent ? `<span class="pill s-pass">${fmtDateTime(sent)}</span>` : '<span class="muted">-</span>'}</td></tr>`;
  }).join('');
  const tabs = Object.entries(MAIL_KINDS).map(([k, v]) => `<button class="${k === mailKind ? 'on' : ''}" onclick="closeModal(this.closest('.backdrop'));openMailModal('${k}')">${v.label}</button>`).join('');
  openModal(`${mHead('안내 메일 발송', `${esc(S.term.name)}`)}
   <nav class="tabs mail-tabs">${tabs}</nav>
   <div class="m-body">
    <div class="notice small" style="margin-bottom:10px">${esc(K.desc)}</div>
    <div class="sec"><h3>받는 사람 <span class="muted small">${list.length ? `<a href="#" onclick="mailAll(true);return false">전체 선택</a> · <a href="#" onclick="mailAll(false);return false">전체 해제</a> · 이미 보낸 사람과 이메일이 없는 사람은 처음에 선택되지 않습니다` : ''}</span></h3>
     ${hasCc && list.length ? `<label style="display:flex;gap:8px;align-items:center;font-weight:600;margin-bottom:8px"><input id="ml-cc-on" type="checkbox" checked style="width:auto"> 추가 이메일에도 같은 내용 보내기 (참조/CC) <span class="muted small" style="font-weight:500">— 쉼표로 여러 개(최대 3개), 입력한 주소는 지원자 정보에 저장됩니다</span></label>` : ''}
     ${list.length ? `<div class="tbl-wrap" style="max-height:260px;overflow:auto"><table class="tbl" style="min-width:${hasCc ? 960 : 780}px"><thead><tr><th></th><th>접수번호</th><th>성명</th><th>학과</th><th>상태</th><th>이메일</th>${hasCc ? '<th>추가 이메일 (참조)</th>' : ''}<th>정보</th><th>보낸 시각</th></tr></thead><tbody>${rows}</tbody></table></div>`
       : '<div class="muted">이 메일을 받을 지원자가 없습니다.</div>'}</div>
    ${K.zoom ? `<div class="sec"><h3>Zoom 주소 <span class="muted small">학과별 주소를 비워 두면 기본 주소가 들어갑니다</span></h3>
     <div class="grid2">${field('기본 Zoom 주소', `<input id="ml-zoom" placeholder="https://us06web.zoom.us/j/..." value="${esc(sv.zoom || '')}" oninput="mailPreview()">`, { full: 1 })}
      ${depts.map(d => field(`${esc(d.name)} Zoom 주소`, `<input class="ml-zd" data-dept="${d.id}" placeholder="(기본 주소 사용)" value="${esc((sv.zoomByDept || {})[d.id] || '')}" oninput="mailPreview()">`)).join('')}</div></div>` : ''}
    ${K.extras ? `<div class="sec"><h3>안내 항목 <span class="muted small">모든 받는 사람에게 같은 내용으로 들어갑니다</span></h3><div class="grid2">
      ${K.extras.map(([k, l, ph]) => field(`${l} <code>{${k}}</code>`, `<input class="ml-ex" data-k="${k}" placeholder="${esc(ph)}" value="${esc((sv.extra || {})[k] || '')}" oninput="mailPreview()">`, { full: 1 })).join('')}</div></div>` : ''}
    ${K.fees ? feeSection(list) : ''}
    ${K.attach ? `<div class="sec"><h3>첨부 파일 <span class="muted small">지원자별로 자동 생성되며, 보낼 때마다 문서 발급 기록이 남습니다 (테스트 발송은 ‘견본’ 번호)</span></h3>
      ${K.attach.map((x, i) => `<label style="display:flex;gap:8px;align-items:center;font-weight:600;margin:4px 0"><input class="ml-att" data-i="${i}" type="checkbox" checked style="width:auto"> ${esc(x.label)} PDF</label>`).join('')}</div>` : ''}
    <div class="sec"><h3>안내문 <span class="muted small"><a href="#" onclick="mailResetTpl();return false">기본 안내문으로 되돌리기</a></span></h3>
     <div class="muted small" style="margin-bottom:6px">아래 표시는 지원자마다 자동으로 바뀝니다: ${K.vars.map(v => `<code>{${v}}</code>`).join(' ')}</div>
     ${field('제목', `<input id="ml-subj" value="${esc(sv.subject || K.subject)}" oninput="mailPreview()">`)}
     ${field('본문', `<textarea id="ml-body" rows="14" oninput="mailPreview()">${esc(sv.body || K.body)}</textarea>`)}</div>
    <div class="sec"><h3>미리보기 <span class="muted small" id="ml-pv-who"></span></h3><div id="ml-pv" class="mail-pv"></div></div>
    <div id="ml-res"></div></div>
   <div class="m-foot"><span class="muted small" id="ml-cnt" style="margin-right:auto"></span>
    <button class="btn" onclick="closeModal(this.closest('.backdrop'))">닫기</button>
    <button class="btn" id="ml-test" onclick="mailSend(true)" ${list.length ? '' : 'disabled'}>내 메일로 테스트 발송</button>
    <button class="btn pri" id="ml-go" onclick="mailSend(false)">발송</button></div>`, { wide: true, sticky: true }).firstElementChild.classList.add('mail');
  mailCount();
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
function mailResetTpl() { const K = MAIL_KINDS[mailKind]; $('#ml-subj').value = K.subject; $('#ml-body').value = K.body; mailPreview(); }
function mailForm() {
  const zoomByDept = {}, extra = {};
  $$('.ml-zd').forEach(i => { if (i.value.trim()) zoomByDept[i.dataset.dept] = i.value.trim(); });
  $$('.ml-ex').forEach(i => { extra[i.dataset.k] = i.value.trim(); });
  const byId = {};
  if (MAIL_KINDS[mailKind].fees) mailTargets().forEach(a => { byId[a.id] = feeVars(a); });
  return { subject: $('#ml-subj').value.trim(), body: $('#ml-body').value, zoom: $('#ml-zoom') ? $('#ml-zoom').value.trim() : '', zoomByDept, extra, byId };
}

/* ---------- 미리보기 (서버와 같은 규칙) ---------- */
function mailDtKo(iso) {
  if (!iso) return '추후 안내';
  const p = Object.fromEntries(new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return `${p.year}년 ${p.month}월 ${p.day}일(${p.weekday}) ${p.hour}:${p.minute}`;
}
const mailDtEn = iso => (iso ? new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) + ' (KST, UTC+9)' : 'To be announced');
function mailDKo(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return '추후 안내';
  return `${m[1]}년 ${+m[2]}월 ${+m[3]}일(${'일월화수목금토'[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()]})`;
}
function mailDEn(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return 'TBA';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
}
const mailWonKo = n => (n == null || n === '' ? '-' : `${Number(n).toLocaleString('ko-KR')}원`);
const mailWonEn = n => (n == null || n === '' ? '-' : `KRW ${Number(n).toLocaleString('en-US')}`);
function mailDiff(pay) {
  if (!pay || pay.paid_amount == null || pay.payable_amount == null) return { ko: '', en: '' };
  const d = Number(pay.paid_amount) - Number(pay.payable_amount);
  if (d > 0) return { ko: `초과송금액 (${mailWonKo(d)})은 입학 후에 환불해 드립니다.`, en: `The overpaid amount (${mailWonEn(d)}) will be refunded after admission.` };
  if (d < 0) return { ko: `부족송금액 (${mailWonKo(-d)})은 입학 전 오리엔테이션 당일에 현금 납부해 주셔야 합니다.`, en: `The shortfall (${mailWonEn(-d)}) must be paid in cash on the day of the orientation before admission.` };
  return { ko: '', en: '' };
}
function mailVars(a, f) {
  const t = S.term || {}, iv = S.interviews[a.id] || {}, pay = S.payments[a.id], o = orderOf(a), dn = mailDiff(pay);
  const sch = pay ? Number(pay.scholarship_amount || 0) : 0;
  return {
    ...f.extra, ...((f.byId || {})[a.id] || {}),
    이름: a.name_ko || '', 영문이름: a.name_en || '', 접수번호: a.receipt_no || '', 학과: deptName(a.department_id), 학기: t.name || '',
    면접일시: mailDtKo(iv.scheduled_at), 면접일시_영문: mailDtEn(iv.scheduled_at),
    면접순서: o != null ? `${o}번` : '추후 안내', 면접순서_영문: o != null ? `No. ${o}` : 'TBA',
    줌주소: f.zoomByDept[a.department_id] || f.zoom || '추후 안내 (TBA)',
    등록금: mailWonKo(pay && pay.tuition_amount), 등록금_영문: mailWonEn(pay && pay.tuition_amount),
    장학금종류: a.scholarship_type || '없음', 장학금종류_영문: a.scholarship_type || 'None',
    장학금: sch ? mailWonKo(sch) : '0원', 장학금_영문: sch ? mailWonEn(sch) : 'KRW 0',
    납부금액: mailWonKo(pay && pay.payable_amount), 납부금액_영문: mailWonEn(pay && pay.payable_amount),
    등록기간: t.register_start ? `${mailDKo(t.register_start)} ~ ${mailDKo(t.register_end)}` : '추후 안내',
    등록기간_영문: t.register_start ? `${mailDEn(t.register_start)} – ${mailDEn(t.register_end)}` : 'TBA',
    은행명: t.bank_name || '', 예금주: t.account_holder || '', 계좌번호: t.account_no || '', SWIFT: t.swift_code || '', 은행주소: t.bank_address || '',
    납입금액: mailWonKo(pay && pay.paid_amount), 납입금액_영문: mailWonEn(pay && pay.paid_amount),
    납부일: mailDKo(pay && pay.paid_at), 납부일_영문: mailDEn(pay && pay.paid_at),
    입학일: mailDKo(t.entry_date), 입학일_영문: mailDEn(t.entry_date),
    기숙사신청: a.dorm_application ? '신청' : '미신청', 기숙사신청_영문: a.dorm_application ? 'Applied' : 'Not applied',
    차액안내: dn.ko, 차액안내_영문: dn.en
  };
}
const mailFill = (tpl, v) => tpl.replace(/\{([^{}]+)\}/g, (m, k) => (k in v ? v[k] : m)).replace(/\n{3,}/g, '\n\n');
function mailPreview() {
  const box = $('#ml-pv'); if (!box) return;
  const ids = mailChecked(), a = S.apps.find(x => x.id === ids[0]) || mailTargets()[0];
  if (!a) { box.innerHTML = '<span class="muted">받는 사람이 없습니다.</span>'; $('#ml-pv-who').textContent = ''; return; }
  const f = mailForm(), v = mailVars(a, f);
  $('#ml-pv-who').textContent = `${a.name_ko} (${a.receipt_no}) 기준`;
  const html = esc(mailFill(f.body, v)).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>');
  box.innerHTML = `<div class="mail-pv-subj">${esc(mailFill(f.subject, v))}</div><div>${html}</div>`;
}

/* ---------- 발송 ---------- */
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
  const K = MAIL_KINDS[mailKind], f = mailForm();
  if (!f.subject || !f.body.trim()) { toast('제목과 본문을 입력하세요.', 'err'); return; }
  if (!zoomOk(f.zoom) || Object.values(f.zoomByDept).some(u => !zoomOk(u))) { toast('Zoom 주소는 https:// 로 시작해야 합니다.', 'err'); return; }
  const ids = mailChecked();
  if (!test && !ids.length) return;
  const warns = [];
  if (K.zoom) { const n = ids.filter(id => { const a = S.apps.find(x => x.id === id); return !(f.zoomByDept[a.department_id] || f.zoom); }).length; if (n) warns.push(`Zoom 주소가 없는 지원자 ${n}명 (‘추후 안내’로 표시됨)`); }
  if (mailKind === '면접안내') { const n = ids.filter(id => !(S.interviews[id] || {}).scheduled_at).length; if (n) warns.push(`면접 일시가 정해지지 않은 지원자 ${n}명`); }
  if (mailKind === '합격등록안내') {
    const n = ids.filter(id => !S.payments[id]).length; if (n) warns.push(`고지 금액이 없는 지원자 ${n}명 (금액이 ‘-’로 표시됨)`);
    if (!S.term.account_no) warns.push('학기 설정에 납부 계좌번호가 비어 있습니다 (등록금 & 등록기간 설정)');
  }
  // 추가 이메일(참조): 형식 확인 후 바뀐 값은 지원자 정보에 저장
  const ccOn = !test && !!$('#ml-cc-on') && $('#ml-cc-on').checked;
  if (ccOn) {
    const bad = [], changed = [];
    for (const id of ids) {
      const el = $(`.ml-cc[data-id="${id}"]`); if (!el) continue;
      const list = splitEmails(el.value), a = S.apps.find(x => x.id === id);
      if (list.some(e => !emailValid(e)) || list.length > 3) { bad.push(a.name_ko); continue; }
      const v = list.join(', ') || null;
      if ((a.cc_emails || null) !== v) changed.push([a, v]);
    }
    if (bad.length) { toast(`추가 이메일 형식을 확인하세요 (최대 3개): ${bad.join(', ')}`, 'err'); return; }
    for (const [a, v] of changed) {
      const { error } = await sb.from('applicants').update({ cc_emails: v }).eq('id', a.id);
      if (error) { toast(`${a.name_ko} 추가 이메일 저장 실패: ${errMsg(error)}`, 'err'); return; }
      a.cc_emails = v;
    }
  }
  const nCc = ccOn ? ids.filter(id => (S.apps.find(x => x.id === id) || {}).cc_emails).length : 0;
  const atts = K.attach ? $$('.ml-att').filter(c => c.checked).map(c => K.attach[Number(c.dataset.i)]) : [];
  const attach = atts.length ? { label: atts.map(x => x.label).join(' + '), can: a => atts.map(x => x.can(a)).find(Boolean) || null } : null;
  if (attach && !test) { const n = ids.filter(id => attach.can(S.apps.find(x => x.id === id))).length; if (n) warns.push(`첨부 문서를 발급할 수 없는 지원자 ${n}명 (이 사람들은 발송되지 않음)`); }
  if (K.fees) {
    const n = ids.filter(id => { const x = mailFees[id]; return x && x.dorm.on && !(x.dorm.amt > 0); }).length;
    if (n) warns.push(`기숙사비를 체크했지만 객실(금액)을 고르지 않은 지원자 ${n}명 (기숙사비가 빠짐)`);
  }
  if (K.extras) { const empty = K.extras.filter(([k]) => !f.extra[k]).map(([, l]) => l); if (empty.length) warns.push(`비어 있는 안내 항목: ${empty.join(', ')}`); }
  if (!test && !confirm(`[${K.label}] ${ids.length}명에게 메일을 발송합니다.` + (attach ? `\n📎 ${attach.label} PDF 첨부 (발급 기록이 남습니다)` : '') + (nCc ? `\n✉ 추가 이메일(참조)도 함께 받는 지원자 ${nCc}명` : '') + (warns.length ? '\n\n⚠ ' + warns.join('\n⚠ ') : '') + '\n\n계속할까요?')) return;
  mailRemember(mailKind, { subject: f.subject, body: f.body, zoom: f.zoom, zoomByDept: f.zoomByDept, extra: f.extra });
  const req = { kind: mailKind, include_cc: ccOn, subject: f.subject, body: f.body, zoom_default: f.zoom, zoom_by_dept: f.zoomByDept, extra: f.extra };
  if (K.fees) req.extra_by_id = f.byId;
  const btns = ['#ml-go', '#ml-test'].map(s => $(s)); btns.forEach(b => { b.disabled = true; });
  const res = $('#ml-res');
  try {
    const withAttach = async (id, sample) => {
      const a = S.apps.find(x => x.id === id), why = attach.can(a);
      if (why) throw new Error(why);
      const files = [];
      for (const x of atts) {
        const { base64 } = await docPdfBase64(id, x.type, sample);
        files.push({ filename: `${x.file}_${a.receipt_no || id}.pdf`, base64 });
      }
      return { [id]: files };
    };
    if (test) {
      const first = ids[0] || mailTargets()[0].id;
      if (attach) res.innerHTML = `<div class="notice">${esc(attach.label)} PDF 만드는 중…</div>`;
      const r = await mailInvoke({ ...req, applicant_ids: [first], test: true, ...(attach ? { attachments: await withAttach(first, true) } : {}) });
      res.innerHTML = '';
      const x = r[0] || {};
      toast(x.ok ? `테스트 메일을 ${x.to} 로 보냈습니다.` : `테스트 발송 실패: ${x.error || '알 수 없는 오류'}`, x.ok ? 'ok' : 'err');
      return;
    }
    const all = [];
    if (attach) {
      // 첨부가 있으면 한 명씩: PDF 생성(발급 기록) → 발송
      for (const id of ids) {
        res.innerHTML = `<div class="notice">발송 중… ${all.length}/${ids.length} (${esc(attach.label)} PDF 생성 포함)</div>`;
        let att;
        try { att = await withAttach(id, false); } catch (e) { all.push({ id, ok: false, error: errMsg(e) }); continue; }
        all.push(...await mailInvoke({ ...req, applicant_ids: [id], attachments: att }));
      }
    } else {
      for (const part of chunk(ids, MAIL_CHUNK)) {
        res.innerHTML = `<div class="notice">발송 중… ${all.length}/${ids.length}</div>`;
        all.push(...await mailInvoke({ ...req, applicant_ids: part }));
      }
    }
    const ok = all.filter(x => x.ok), bad = all.filter(x => !x.ok);
    const now = new Date().toISOString();
    res.innerHTML = `<div class="${bad.length ? 'warn' : 'notice'}"><b>${ok.length}명</b> 발송 완료${bad.length ? `, <b>${bad.length}명</b> 실패` : ''}</div>
      ${bad.length ? `<div class="err-box" style="white-space:pre-wrap;margin-top:6px">${esc(bad.map(x => { const a = S.apps.find(y => y.id === x.id) || {}; return `${a.receipt_no || ''} ${a.name_ko || ''}: ${x.error}`; }).join('\n'))}</div>` : ''}`;
    toast(bad.length ? `${ok.length}명 발송, ${bad.length}명 실패` : `${ok.length}명에게 발송했습니다.`, bad.length ? 'err' : 'ok');
    ok.forEach(x => { mailLogs[x.id] = now; const c = $(`.ml-ck[data-id="${x.id}"]`); if (c) { c.checked = false; c.closest('tr').lastElementChild.innerHTML = `<span class="pill s-pass">${fmtDateTime(now)}</span>`; } });
  } catch (e) {
    res.innerHTML = `<div class="err-box">${esc(errMsg(e))}</div>`;
    toast(errMsg(e), 'err');
  } finally { btns.forEach(b => { b.disabled = false; }); mailCount(); }
}

/* ---------- 사람별 납부 비용 (오리엔테이션 안내) ----------
   등록금 부족분: 고지 금액 − 수납 금액 (자동)
   외국인등록비: 비자가 없거나(국외 체류) 현재 비자로 유학할 수 없는 사람에게 자동 체크
   기숙사비: 지원자 정보의 기숙사 기간·객실 유형(dorm_room)으로 자동 — 여기서 고르면 지원자 정보에도 저장
            (DB에 dorm_room 칸이 없을 때만 이 브라우저에 기억) */
const ARC_FEE_DEFAULT = 35000;
let mailFees = {};
const feeKey = () => 'mailFees:' + ((S.term && S.term.id) || '');
function feeSaved() { try { return JSON.parse(localStorage.getItem(feeKey()) || 'null') || {}; } catch (e) { return {}; } }
function feeSave() {
  const o = { arc: feeArcAmt(), dorm: {} };
  if (!feeDb()) Object.entries(mailFees).forEach(([id, x]) => { if (x.dorm.opt) o.dorm[id] = x.dorm.opt; });
  try { localStorage.setItem(feeKey(), JSON.stringify(o)); } catch (e) { /* 무시 */ }
}
function feeArcAmt() { const el = $('#fe-arc'); const n = el ? Number(String(el.value).replace(/[^\d]/g, '')) : NaN; return Number.isFinite(n) && n > 0 ? n : (feeSaved().arc || ARC_FEE_DEFAULT); }
// 외국인등록비가 필요 없는 체류자격: D-2(유학), F-2·F-4·F-5·F-6 — D-4(어학연수)는 D-2로 바꿔야 하므로 등록비 필요
const studyVisa = v => /(^|[^A-Z])D-?\s*2(?![0-9])/i.test(v) || /(^|[^A-Z])F-?\s*[2456](?![0-9])/i.test(v);
function feeArcWhy(a) {
  const v = String(a.visa_type || '').trim();
  if (!v || /국외|해외|없음|none|abroad/i.test(v)) return { on: true, why: '국외 체류(비자 없음)' };
  if (studyVisa(v)) return { on: false, why: `유학 가능 비자 ${v}` };
  return { on: true, why: /(^|[^A-Z])D-?\s*4/i.test(v) ? `현재 비자 ${v} — D-2 변경 필요` : `현재 비자 ${v} — 유학 불가` };
}
function feeShort(a) {
  const p = S.payments[a.id];
  if (!p || p.paid_amount == null || p.payable_amount == null) return { amt: 0, why: p ? '수납 기록 없음' : '고지 금액 없음' };
  const d = Number(p.payable_amount) - Number(p.paid_amount);
  return d > 0 ? { amt: d, why: `고지 ${won(p.payable_amount)} · 수납 ${won(p.paid_amount)}` } : { amt: 0, why: d < 0 ? '초과 송금' : '완납' };
}
function feeInit(list) {
  const sv = feeSaved(); mailFees = {};
  list.forEach(a => {
    const sh = feeShort(a), arc = feeArcWhy(a), opt = a.dorm_room || (feeDb() ? '' : (sv.dorm || {})[a.id]) || '', d = dormRoom(opt);
    mailFees[a.id] = { sh: { on: sh.amt > 0, amt: sh.amt, why: sh.why }, arc: { on: arc.on, why: arc.why },
      dorm: { on: !!a.dorm_application, opt: d ? opt : '', amt: d ? d.amt : 0 } };
  });
}
const feeDb = () => !!(S.hasCol && S.hasCol.dorm_room);
async function feeDormStore(id, k) {
  const a = S.apps.find(x => x.id === id); if (!a || !feeDb() || (a.dorm_room || null) === (k || null)) return;
  const p = { dorm_room: k || null }; if (k) p.dorm_application = true;
  const { error } = await sb.from('applicants').update(p).eq('id', id);
  if (error) { toast(`${a.name_ko} 기숙사 객실 저장 실패: ${errMsg(error)}`, 'err'); return; }
  Object.assign(a, p);
  toast(`${a.name_ko}: 기숙사 ${k ? dormRoom(k).ko : '객실 미정'} — 지원자 정보에 저장했습니다.`);
}
function feeTotal(x) { return (x.sh.on ? x.sh.amt : 0) + (x.arc.on ? feeArcAmt() : 0) + (x.dorm.on ? x.dorm.amt : 0); }
function feeSection(list) {
  feeInit(list);
  const arcAmt = feeSaved().arc || ARC_FEE_DEFAULT;
  const rows = list.map(a => {
    const x = mailFees[a.id];
    const ck = (f, on) => `<input type="checkbox" class="fe-ck" data-id="${a.id}" data-f="${f}" ${on ? 'checked' : ''} onchange="feeRead()" style="width:auto">`;
    return `<tr><td class="nw">${esc(a.receipt_no)}</td><td>${esc(a.name_ko)}<div class="muted small">${esc(a.name_en)}</div></td>
      <td class="nw">${ck('sh', x.sh.on)} <input class="fe-sh" data-id="${a.id}" type="number" min="0" step="1000" value="${x.sh.amt || ''}" placeholder="0" oninput="feeRead()" style="width:110px;padding:5px 7px;font-size:12px">
        <div class="muted small">${esc(x.sh.why)}</div></td>
      <td class="nw">${ck('arc', x.arc.on)} <span class="fe-arc-amt">${won(arcAmt)}</span><div class="muted small">${esc(x.arc.why)}</div></td>
      <td class="nw">${ck('dorm', x.dorm.on)} <select class="fe-dorm" data-id="${a.id}" onchange="feeRead()" style="width:auto;padding:5px 7px;font-size:12px">
          <option value="">객실·기간 선택</option>${DORM_FEES.map(d => `<option value="${d.k}" ${d.k === x.dorm.opt ? 'selected' : ''}>${esc(d.ko)} — ${won(d.amt)}</option>`).join('')}</select>
        <div class="muted small">${a.dorm_application ? (dormRoom(a.dorm_room) ? '지원자 정보에 저장된 객실' : '기숙사 신청 · 객실 미정') : '기숙사 미신청'}</div></td>
      <td class="nw" style="font-weight:700" id="fe-tot-${a.id}">${won(feeTotal(x))}</td></tr>`;
  }).join('');
  return `<div class="sec"><h3>납부 비용 (사람별) <span class="muted small">체크한 항목만 본문의 <code>{납부비용}</code> 자리에 들어가고, 하나도 없으면 그 부분이 빠집니다</span></h3>
    <div class="muted small" style="margin-bottom:6px">등록금 부족분은 수납 금액으로 자동 계산 · 외국인등록비는 비자가 없거나(국외 체류) D-2·F 비자가 아닌 사람(D-4 포함)에게 자동 체크 · 기숙사비는 지원자 정보의 기숙사 기간·객실 유형으로 자동으로 들어갑니다${feeDb() ? ' (여기서 고르면 지원자 정보에도 저장)' : ' (DB에 객실 칸이 없어 고른 객실은 이 브라우저에만 기억 — sql/2026-11-11_기숙사_객실유형.sql 실행 필요)'}</div>
    <div class="grid2">${field('외국인등록비 (1인)', `<input id="fe-arc" type="number" min="0" step="1000" value="${arcAmt}" oninput="feeRead()">`)}</div>
    ${list.length ? `<div class="tbl-wrap" style="max-height:300px;overflow:auto"><table class="tbl" style="min-width:900px"><thead><tr><th>접수번호</th><th>성명</th><th>등록금 부족분</th><th>외국인등록비</th><th>기숙사비</th><th>합계</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}</div>`;
}
function feeRead() {
  const arc = feeArcAmt();
  $$('.fe-arc-amt').forEach(e => { e.textContent = won(arc); });
  Object.entries(mailFees).forEach(([id, x]) => {
    const q = (c, f) => $(`.${c}[data-id="${id}"]${f ? `[data-f="${f}"]` : ''}`);
    const c1 = q('fe-ck', 'sh'), c2 = q('fe-ck', 'arc'), c3 = q('fe-ck', 'dorm'), amt = q('fe-sh'), sel = q('fe-dorm');
    if (!c1) return;
    x.sh.on = c1.checked; x.sh.amt = Math.max(0, Number(amt.value) || 0);
    x.arc.on = c2.checked;
    const d = DORM_FEES.find(o => o.k === sel.value);
    if (d && d.k !== x.dorm.opt) c3.checked = true; // 객실을 고르면 자동 체크
    if ((d ? d.k : '') !== x.dorm.opt) feeDormStore(id, d ? d.k : '');
    x.dorm.opt = d ? d.k : ''; x.dorm.amt = d ? d.amt : 0; x.dorm.on = c3.checked;
    const t = $(`#fe-tot-${id}`); if (t) t.textContent = won(feeTotal(x));
  });
  feeSave(); mailPreview();
}
function feeVars(a) {
  const x = mailFees[a.id];
  if (!x) return { 납부비용: '', 납부비용_영문: '' };
  const it = [];
  if (x.sh.on && x.sh.amt > 0) it.push(['등록금 부족분', 'Tuition shortfall', x.sh.amt]);
  if (x.arc.on) it.push(['외국인등록비', 'Alien registration fee', feeArcAmt()]);
  if (x.dorm.on && x.dorm.amt > 0) { const d = DORM_FEES.find(o => o.k === x.dorm.opt); it.push([`기숙사비 (${d.ko})`, `Dormitory fee (${d.en})`, x.dorm.amt]); }
  if (!it.length) return { 납부비용: '', 납부비용_영문: '' };
  const sum = it.reduce((n, i) => n + i[2], 0);
  return {
    납부비용: ['[오리엔테이션 당일 납부 비용 — 현금 납부]', '아래 금액은 오리엔테이션 당일 현장에서 현금으로 납부해 주셔야 합니다. (카드·계좌이체 불가)', ...it.map(i => `- ${i[0]}: ${mailWonKo(i[2])}`), `▶ 합계: ${mailWonKo(sum)} (현금)`].join('\n'),
    납부비용_영문: ['[Fees to Pay on Orientation Day — Cash Only]', 'Please pay the amount below in cash on the orientation day. (Card payments and bank transfers are not accepted.)', ...it.map(i => `- ${i[1]}: ${mailWonEn(i[2])}`), `▶ Total: ${mailWonEn(sum)} (in cash)`].join('\n')
  };
}
