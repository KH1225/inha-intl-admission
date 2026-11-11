'use strict';
/* ===== 제출서류 체크리스트 설정 (입학구분 × 전형유형) ===== */

/* 지원자에게 보이는 서류인지 (사용 중 + 입학구분 일치 + 전형유형에서 '제외'가 아님) */
function docVisible(t, a) {
  if (t.active === false || t.admission_kind !== a.admission_kind) return false;
  if (!a.qualification_code) return true;
  return a.qualification_code === 'T2' ? t.show_t2 !== false : t.show_t1 !== false;
}
function docRequired(t, a) {
  return !!a.qualification_code && docVisible(t, a) && !!(a.qualification_code === 'T2' ? t.required_t2 : t.required_t1);
}
const qualLabel = c => (S.qualMap[c] ? S.qualMap[c].name_ko : c === 'T2' ? '전교육과정 해외이수 외국인' : '순수외국인');

/* 표준안: [서류명, 순수외국인(T1), 전교육과정 해외이수(T2)]  R=필수 O=선택 X=제외 */
const STD_DOCS = {
  신입학: [
    ['입학지원서', 'R', 'R'],
    ['자기소개서 및 학업계획서', 'R', 'R'],
    ['여권 사본', 'R', 'R'],
    ['증명사진 (3×4cm)', 'R', 'R'],
    ['고등학교 졸업(예정)증명서 (아포스티유/영사확인)', 'R', 'R'],
    ['고등학교 전 학년 성적증명서 (아포스티유/영사확인)', 'R', 'R'],
    ['부모 국적 증명서류 (부모 여권 사본 등)', 'R', 'X'],
    ['가족관계 증명서류 (출생증명서 등, 아포스티유)', 'R', 'X'],
    ['초·중학교 졸업증명서 및 전 학년 성적증명서 (아포스티유)', 'X', 'R'],
    ['출입국사실증명서', 'X', 'R'],
    ['은행 잔고증명서 (재정능력 입증)', 'R', 'R'],
    ['한국어능력 증빙 (TOPIK 성적표 등)', 'O', 'O'],
    ['외국인등록증 사본 (국내 체류자)', 'O', 'O'],
    ['개인정보 수집·이용 동의서', 'R', 'R'],
    ['학력조회 동의서', 'R', 'R']
  ],
  편입학: [
    ['입학지원서', 'R', 'R'],
    ['자기소개서 및 학업계획서', 'R', 'R'],
    ['여권 사본', 'R', 'R'],
    ['증명사진 (3×4cm)', 'R', 'R'],
    ['대학 졸업(수료·예정)증명서 (아포스티유/영사확인)', 'R', 'R'],
    ['대학 전 학년 성적증명서 (아포스티유/영사확인)', 'R', 'R'],
    ['고등학교 졸업증명서 (아포스티유/영사확인)', 'O', 'X'],
    ['부모 국적 증명서류 (부모 여권 사본 등)', 'R', 'X'],
    ['가족관계 증명서류 (출생증명서 등, 아포스티유)', 'R', 'X'],
    ['초·중·고등학교 졸업증명서 및 전 학년 성적증명서 (아포스티유)', 'X', 'R'],
    ['출입국사실증명서', 'X', 'R'],
    ['은행 잔고증명서 (재정능력 입증)', 'R', 'R'],
    ['한국어능력 증빙 (TOPIK 성적표 등)', 'O', 'O'],
    ['외국인등록증 사본 (국내 체류자)', 'O', 'O'],
    ['개인정보 수집·이용 동의서', 'R', 'R'],
    ['학력조회 동의서', 'R', 'R']
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
     <button class="btn sm pur" onclick="loadStdDocs()">표준 서류 목록 불러오기</button>
     <span class="muted small" style="align-self:center">표준 목록은 일반적인 외국인 특별전형 기준입니다. 학교 모집요강에 맞게 고쳐 주세요.</span></div></div>
   <div class="m-foot"><button class="btn" onclick="closeModal(this.closest('.backdrop'))">닫기</button><button class="btn pri" onclick="saveDocSettings()">저장</button></div>`, { wide: true, sticky: true });
  renderDocSettings();
}
function renderDocSettings() {
  $('#doc-tabs').innerHTML = ['신입학', '편입학'].map(k => `<button class="tab ${docKind === k ? 'on' : ''}" onclick="readDocInputs();docKind='${k}';renderDocSettings()">${k}</button>`).join('');
  const rows = docRows.filter(t => t.admission_kind === docKind).sort((x, y) => (x.sort_order || 0) - (y.sort_order || 0));
  const sel = (st, cls) => `<select class="${cls} st-${st}" onchange="this.className='${cls} st-'+this.value">${[['R', '필수'], ['O', '선택'], ['X', '제외']].map(([v, l]) => `<option value="${v}" ${st === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  $('#doc-body').innerHTML = `<div class="tbl-wrap"><table class="tbl doc-set" style="min-width:760px"><thead><tr><th style="width:64px">순서</th><th>서류명</th>
     <th style="width:150px">${esc(qualLabel('T1'))}</th><th style="width:150px">${esc(qualLabel('T2'))}</th><th style="width:52px">사용</th></tr></thead><tbody>
   ${rows.map(t => `<tr data-key="${esc(t.code != null ? 'c:' + t.code : 'n:' + t._new)}" class="${t.active === false ? 'off' : ''}">
     <td><input class="ds-o" type="number" value="${esc(t.sort_order == null ? '' : t.sort_order)}" style="width:56px"></td>
     <td><input class="ds-n" value="${esc(t.name_ko || '')}" placeholder="서류명"></td>
     <td>${sel(t._s1, 'ds-1')}</td><td>${sel(t._s2, 'ds-2')}</td>
     <td style="text-align:center"><input class="ds-a" type="checkbox" ${t.active === false ? '' : 'checked'} style="width:auto"></td></tr>`).join('')
     || `<tr><td colspan="5" class="muted" style="text-align:center;padding:20px">${docKind} 서류가 없습니다. “표준 서류 목록 불러오기”를 눌러 보세요.</td></tr>`}</tbody></table></div>`;
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
  const norm = s => String(s || '').replace(/\s/g, '');
  const have = new Set(docRows.filter(t => t.admission_kind === docKind).map(t => norm(t.name_ko)));
  let n = 0, o = nextOrder();
  STD_DOCS[docKind].forEach(([name, s1, s2]) => {
    if (have.has(norm(name))) return;
    docRows.push({ _new: ++docNewSeq, admission_kind: docKind, name_ko: name, sort_order: o++, _s1: s1, _s2: s2, active: true }); n++;
  });
  renderDocSettings();
  toast(n ? `${docKind} 표준 서류 ${n}개를 추가했습니다. 확인 후 “저장”을 누르세요. (필요 없는 기존 서류는 ‘사용’을 끄세요)` : '이미 표준 서류가 모두 들어 있습니다.');
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
      toast(/show_t|active|column/.test(m) ? '제출서류 설정용 칸이 DB에 아직 없습니다. 관리자에게 SQL 적용을 요청하세요.' : `“${t.name_ko}” 저장 실패: ${m}`, 'err');
      await loadStatic(); return;
    }
  }
  await loadStatic();
  setBusy(false);
  toast(`제출서류 ${todo.length}건을 저장했습니다.`);
  closeModal(); renderShell();
}
