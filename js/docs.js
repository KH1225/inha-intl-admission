'use strict';
/* ===== 제출서류 체크리스트 설정 (입학구분 × 전형유형) ===== */

/* 서류 구분: 전공심화과정 학과 지원자는 '전공심화', 그 외는 입학구분(신입학/편입학) */
const DOC_KINDS = ['신입학', '편입학', '전공심화'];
function docKindOf(a) {
  const d = S.deptMap[a.department_id];
  return d && d.program_type === '전공심화' ? '전공심화' : a.admission_kind;
}
/* 지원자에게 보이는 서류인지 (사용 중 + 서류 구분 일치 + 전형유형에서 '제외'가 아님) */
function docVisible(t, a) {
  if (t.active === false || t.admission_kind !== docKindOf(a)) return false;
  if (!a.qualification_code) return true;
  return a.qualification_code === 'T2' ? t.show_t2 !== false : t.show_t1 !== false;
}
/* 면제: 신입학 국내 고교 출신자는 외국학교 학력조회 동의서 제출 불요 */
function docExempt(t, a) {
  return docKindOf(a) === '신입학' && !!a.domestic_hs && /학력조회\s*동의서/.test(t.name_ko || '');
}
function docRequired(t, a) {
  return !!a.qualification_code && docVisible(t, a) && !docExempt(t, a) && !!(a.qualification_code === 'T2' ? t.required_t2 : t.required_t1);
}
const qualLabel = c => (S.qualMap[c] ? S.qualMap[c].name_ko : c === 'T2' ? '유형2 (해외 전 교육과정 이수)' : '유형1 (부모 모두 외국인)');

/* 2027학년도 외국인 특별전형 모집요강 「IV. 제출서류」 기준
   [서류명, 유형1(부모 모두 외국인), 유형2(해외 전 교육과정 이수)]  R=필수 O=선택 X=해당없음(-) */
const STD_DOCS = {
  신입학: [
    ['입학지원서 [Form 1]', 'R', 'R'],
    ['자기소개서 [Form 2]', 'R', 'R'],
    ['한국어능력 증빙서류 (TOPIK 성적증명서 또는 사회통합프로그램 수료증명서·성적확인서 중 택1)', 'R', 'R'],
    ['외국학교 학력조회 동의서 [Form 3]', 'R', 'R'],
    ['개인정보 수집 및 이용 동의서 [Form 4]', 'R', 'R'],
    ['고등학교 졸업(예정)증명서 및 성적증명서 (아포스티유/영사확인, 국내고교는 생활기록부Ⅱ)', 'R', 'R'],
    ['부모·학생 국적 증명 가족관계 입증서류 (번역 공증)', 'R', 'R'],
    ['여권 사본 (지원자, 부모)', 'R', 'R'],
    ['증명사진 3매 (흰색배경 3.5×4.5cm)', 'R', 'R'],
    ['초등학교·중학교 재학사실증명서 및 성적증명서 (아포스티유/영사확인)', 'X', 'R'],
    ['출입국사실증명서', 'O', 'R'],
    ['한국어연수기관 재학(수료)·성적·출석증명서 (D-4 비자 보유자만)', 'O', 'O'],
    ['추천서 (학교장 또는 선생님, 자유양식)', 'O', 'O']
  ],
  편입학: [
    ['입학지원서 [Form 1]', 'R', 'R'],
    ['자기소개서 [Form 2]', 'R', 'R'],
    ['한국어능력 증빙서류 (TOPIK 또는 사회통합프로그램, 성적 소지자만)', 'O', 'O'],
    ['추천서 (학교장 또는 학과장, 자유양식)', 'R', 'R'],
    ['외국학교 학력조회 동의서 [Form 3]', 'R', 'R'],
    ['개인정보 수집 및 이용 동의서 [Form 4]', 'R', 'R'],
    ['고등학교 졸업증명서 (아포스티유/영사확인)', 'R', 'R'],
    ['대학 재학증명서 및 성적증명서 (아포스티유/영사확인)', 'R', 'R'],
    ['부모·학생 국적 증명 가족관계 입증서류 (번역 공증)', 'R', 'R'],
    ['여권 사본 (지원자, 부모)', 'R', 'R'],
    ['증명사진 3매 (흰색배경 3.5×4.5cm)', 'R', 'R'],
    ['초등학교·중학교 재학사실증명서 및 성적증명서 (아포스티유/영사확인)', 'X', 'R'],
    ['고등학교 성적증명서', 'X', 'R'],
    ['출입국사실증명서', 'X', 'R']
  ],
  /* 2027학년도 학사학위 전공심화과정 외국인 모집요강 「IV. 제출서류」 */
  전공심화: [
    ['입학지원서 [Form 1]', 'R', 'R'],
    ['자기소개서 [Form 2]', 'R', 'R'],
    ['개인정보 수집 및 이용 동의서 [Form 3]', 'R', 'R'],
    ['한국어능력 증빙서류 (TOPIK 성적증명서 또는 사회통합프로그램 수료증명서·성적확인서 중 택1)', 'R', 'R'],
    ['전문대학 또는 일반대학(4년제) 졸업증명서 및 성적증명서 (본교 졸업(예정)자 제출 불요)', 'R', 'R'],
    ['부모·학생 국적 증명 가족관계 입증서류 (번역 공증, 본교 졸업(예정)자 제출 불요)', 'R', 'R'],
    ['여권 사본 (지원자, 부모 / 본교 졸업(예정)자는 본인만)', 'R', 'R'],
    ['출입국사실증명서', 'R', 'R']
  ]
};

let docKind = '신입학', docRows = [], docNewSeq = 0;
const stateOf = (t, q) => ((q === 'T2' ? t.show_t2 : t.show_t1) === false ? 'X' : (q === 'T2' ? t.required_t2 : t.required_t1) ? 'R' : 'O');

function openDocSettings() {
  docRows = S.docTypes.map(t => ({ ...t, _s1: stateOf(t, 'T1'), _s2: stateOf(t, 'T2') }));
  openModal(`${mHead('제출서류 설정', '입학구분 · 전형유형별 제출서류 체크리스트')}
   <div class="m-body">
    <div class="tabs" id="doc-tabs" style="margin-bottom:10px"></div>
    <div class="notice small" style="margin-bottom:10px"><b>필수</b>: 체크리스트에 ‘필수’로 표시되고 서류 구비율에 포함 · <b>선택</b>: 체크리스트에만 표시 · <b>제외</b>: 해당 전형 지원자에게 보이지 않음</div>
    <div id="doc-body"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
     <button class="btn sm" onclick="addDocRow()">＋ 서류 추가</button>
     <button class="btn sm pur" onclick="loadStdDocs()">2027 모집요강 기준으로 맞추기</button>
     <span class="muted small" style="align-self:center">신입학·편입학은 외국인 특별전형, 전공심화는 학사학위 전공심화과정 외국인 모집요강(2027) 기준입니다. 탭마다 각각 눌러 주세요. 전공심화 학과 지원자에게는 ‘전공심화’ 서류가 적용됩니다.</span></div></div>
   <div class="m-foot"><button class="btn" onclick="closeModal(this.closest('.backdrop'))">닫기</button><button class="btn pri" onclick="saveDocSettings()">저장</button></div>`, { wide: true, sticky: true });
  renderDocSettings();
}
function renderDocSettings() {
  $('#doc-tabs').innerHTML = DOC_KINDS.map(k => `<button class="tab ${docKind === k ? 'on' : ''}" onclick="readDocInputs();docKind='${k}';renderDocSettings()">${k}</button>`).join('');
  const rows = docRows.filter(t => t.admission_kind === docKind).sort((x, y) => (x.sort_order || 0) - (y.sort_order || 0));
  const sel = (st, cls) => `<select class="${cls} st-${st}" onchange="this.className='${cls} st-'+this.value">${[['R', '필수'], ['O', '선택'], ['X', '제외']].map(([v, l]) => `<option value="${v}" ${st === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  $('#doc-body').innerHTML = `<div class="tbl-wrap"><table class="tbl doc-set" style="min-width:760px"><thead><tr><th style="width:64px">순서</th><th>서류명</th>
     <th style="width:150px">${esc(qualLabel('T1'))}</th><th style="width:150px">${esc(qualLabel('T2'))}</th><th style="width:52px">사용</th></tr></thead><tbody>
   ${rows.map(t => `<tr data-key="${esc(t.code != null ? 'c:' + t.code : 'n:' + t._new)}" class="${t.active === false ? 'off' : ''}">
     <td><input class="ds-o" type="number" value="${esc(t.sort_order == null ? '' : t.sort_order)}" style="width:56px"></td>
     <td><input class="ds-n" value="${esc(t.name_ko || '')}" placeholder="서류명"></td>
     <td>${sel(t._s1, 'ds-1')}</td><td>${sel(t._s2, 'ds-2')}</td>
     <td style="text-align:center"><input class="ds-a" type="checkbox" ${t.active === false ? '' : 'checked'} style="width:auto"></td></tr>`).join('')
     || `<tr><td colspan="5" class="muted" style="text-align:center;padding:20px">${docKind} 서류가 없습니다. “2027 모집요강 기준으로 맞추기”를 눌러 보세요.</td></tr>`}</tbody></table></div>`;
}
function rowByKey(k) { return docRows.find(t => (t.code != null ? 'c:' + t.code : 'n:' + t._new) === k); }
function readDocInputs() {
  $$('#doc-body tr[data-key]').forEach(tr => {
    const t = rowByKey(tr.dataset.key); if (!t) return;
    t.name_ko = $('.ds-n', tr).value.trim();
    t.sort_order = $('.ds-o', tr).value === '' ? null : Number($('.ds-o', tr).value);
    t._s1 = $('.ds-1', tr).value; t._s2 = $('.ds-2', tr).value; t.active = $('.ds-a', tr).checked;
  });
}
function nextOrder() { return Math.max(0, ...docRows.filter(t => t.admission_kind === docKind).map(t => t.sort_order || 0)) + 1; }
function addDocRow() {
  readDocInputs();
  docRows.push({ _new: ++docNewSeq, admission_kind: docKind, name_ko: '', sort_order: nextOrder(), _s1: 'R', _s2: 'R', active: true });
  renderDocSettings();
  const ins = $$('#doc-body .ds-n'); if (ins.length) ins[ins.length - 1].focus();
}
function loadStdDocs() {
  readDocInputs();
  const norm = x => String(x || '').replace(/\s/g, '');
  const std = STD_DOCS[docKind];
  const stdNames = new Set(std.map(([n]) => norm(n)));
  const mine = docRows.filter(t => t.admission_kind === docKind);
  const off = mine.filter(t => t.active !== false && !stdNames.has(norm(t.name_ko)) && t.code != null);
  if (!confirm(`${docKind} 서류를 2027학년도 ${docKind === '전공심화' ? '전공심화과정 ' : ''}모집요강 기준(${std.length}개)으로 맞춥니다.\n` +
    (off.length ? `모집요강에 없는 기존 서류 ${off.length}개는 ‘사용 안 함’으로 바뀝니다. (지원자 체크 기록은 보존)\n` : '') + '확인 후 “저장”을 눌러야 반영됩니다.')) return;
  docRows = docRows.filter(t => !(t.admission_kind === docKind && t.code == null && !stdNames.has(norm(t.name_ko))));
  off.forEach(t => { t.active = false; t.sort_order = 900 + (t.sort_order || 0); });
  let added = 0;
  std.forEach(([name, s1, s2], k) => {
    const ex = docRows.find(t => t.admission_kind === docKind && norm(t.name_ko) === norm(name));
    if (ex) Object.assign(ex, { _s1: s1, _s2: s2, active: true, sort_order: k + 1 });
    else { docRows.push({ _new: ++docNewSeq, admission_kind: docKind, name_ko: name, sort_order: k + 1, _s1: s1, _s2: s2, active: true }); added++; }
  });
  renderDocSettings();
  toast(`${docKind}: 모집요강 서류 ${std.length}개로 맞췄습니다 (새로 추가 ${added}개). 확인 후 “저장”을 누르세요.`);
}
function newDocCode(i) {
  const codes = S.docTypes.map(t => t.code).concat(docRows.map(t => t.code)).filter(c => c != null);
  if (codes.length && codes.every(c => typeof c === 'number')) return Math.max(...codes) + 1 + i;
  return 'D' + Date.now().toString(36).toUpperCase() + i;
}
async function saveDocSettings() {
  readDocInputs();
  const live = docRows.filter(t => t.code != null || t.name_ko);
  if (live.some(t => !t.name_ko)) { toast('서류명이 비어 있는 줄이 있습니다.', 'err'); return; }
  const body = t => ({ name_ko: t.name_ko, admission_kind: t.admission_kind, sort_order: t.sort_order, active: t.active !== false,
    required_t1: t._s1 === 'R', required_t2: t._s2 === 'R', show_t1: t._s1 !== 'X', show_t2: t._s2 !== 'X' });
  const changed = t => {
    if (t.code == null) return true;
    const o = S.docTypes.find(x => x.code === t.code) || {}, b = body(t);
    return Object.keys(b).some(k => ((k === 'active' || k.startsWith('show_')) ? o[k] !== false : k.startsWith('required_') ? !!o[k] : o[k]) !== b[k]);
  };
  const todo = live.filter(changed);
  if (!todo.length) { toast('바뀐 내용이 없습니다.'); return; }
  setBusy(true);
  let i = 0;
  for (const t of todo) {
    const r = t.code != null
      ? await sb.from('document_types').update(body(t)).eq('code', t.code)
      : await sb.from('document_types').insert({ code: newDocCode(i++), ...body(t) });
    if (r.error) {
      setBusy(false);
      const m = errMsg(r.error);
      toast(/show_t|active|column/.test(m) ? '제출서류 설정용 칸이 DB에 아직 없습니다. 관리자에게 SQL 적용을 요청하세요.'
        : /check constraint|invalid input value/i.test(m) ? 'DB가 아직 ‘전공심화’ 서류 구분을 모릅니다. 전공심화 SQL을 실행해 주세요.' : `“${t.name_ko}” 저장 실패: ${m}`, 'err');
      await loadStatic(); return;
    }
  }
  await loadStatic();
  setBusy(false);
  toast(`제출서류 ${todo.length}건을 저장했습니다.`);
  closeModal(); renderShell();
}
