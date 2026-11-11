// Supabase Edge Function: send-interview-mail
// 지원자 안내 메일 일괄 발송 — 면접안내 / 합격등록안내 / 입금확인 / OT안내
// (국제교류원 총괄관리자 / 국제교류팀만 사용 가능)
//
// 필요한 Secrets (Supabase > Edge Functions > Secrets)
//   MAIL_FROM      보내는 사람.  예: 인하공업전문대학 국제교류팀 <itc.intl@gmail.com>
//   MAIL_REPLY_TO  (선택) 답장 받을 주소
//   방법 A — Gmail 등 SMTP:  SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_USER=계정  SMTP_PASS=앱 비밀번호
//   방법 B — Resend:         RESEND_API_KEY=re_xxx  (보내는 도메인 인증 필요)
//
// 받는 사람은 항상 DB에 저장된 지원자 이메일만 씁니다 (임의 주소로는 보낼 수 없음).
// {이름}, {등록금}, {계좌번호} 같은 값도 모두 서버가 DB에서 읽어 채웁니다.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MAX_PER_CALL = 25;
const env = (k: string) => Deno.env.get(k) ?? "";

/* 메일 종류별로 보낼 수 있는 지원자 조건 (실수 방지) */
type Row = Record<string, any>;
const KINDS: Record<string, (a: Row, pay: Row | undefined) => string | null> = {
  면접안내: (a) => (["접수취소", "불합격"].includes(a.status) ? `현재 상태가 ${a.status}입니다` : null),
  합격등록안내: (a) => (["최종합격", "등록완료"].includes(a.status) ? null : "최종합격자가 아닙니다"),
  입금확인: (_a, p) => (p && p.paid_at ? null : "납부일이 입력되지 않았습니다"),
  OT안내: (a) => (a.status === "등록완료" ? null : "등록완료자가 아닙니다"),
};

/* ---------- 날짜·금액 표기 (사이트 미리보기와 같은 규칙) ---------- */
const TZ = "Asia/Seoul";
function partsOf(d: Date, opt: Intl.DateTimeFormatOptions, loc = "ko-KR") {
  return Object.fromEntries(new Intl.DateTimeFormat(loc, { timeZone: TZ, ...opt }).formatToParts(d).map((x) => [x.type, x.value]));
}
function dtKo(iso: string | null) {
  if (!iso) return "추후 안내";
  const p = partsOf(new Date(iso), { year: "numeric", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${p.year}년 ${p.month}월 ${p.day}일(${p.weekday}) ${p.hour}:${p.minute}`;
}
function dtEn(iso: string | null) {
  if (!iso) return "To be announced";
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) + " (KST, UTC+9)";
}
// 'YYYY-MM-DD' 날짜만
function dKo(ymd: string | null) {
  const m = String(ymd ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "추후 안내";
  const wd = "일월화수목금토"[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
  return `${m[1]}년 ${+m[2]}월 ${+m[3]}일(${wd})`;
}
function dEn(ymd: string | null) {
  const m = String(ymd ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "TBA";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", year: "numeric", month: "long", day: "numeric" }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
}
const wonKo = (n: unknown) => (n == null || n === "" ? "-" : `${Number(n).toLocaleString("ko-KR")}원`);
const wonEn = (n: unknown) => (n == null || n === "" ? "-" : `KRW ${Number(n).toLocaleString("en-US")}`);

/* 입금액 - 납부할 금액 차액 안내 (차액이 없으면 빈 문자열) */
function diffNotice(pay: Row | undefined) {
  if (!pay || pay.paid_amount == null || pay.payable_amount == null) return { ko: "", en: "" };
  const d = Number(pay.paid_amount) - Number(pay.payable_amount);
  if (d > 0) return { ko: `초과송금액 (${wonKo(d)})은 입학 후에 환불해 드립니다.`, en: `The overpaid amount (${wonEn(d)}) will be refunded after admission.` };
  if (d < 0) return { ko: `부족송금액 (${wonKo(-d)})은 입학 전 오리엔테이션 당일에 현금 납부해 주셔야 합니다.`, en: `The shortfall (${wonEn(-d)}) must be paid in cash on the day of the orientation before admission.` };
  return { ko: "", en: "" };
}
function buildVars(a: Row, t: Row, deptName: string, iv: Row | undefined, pay: Row | undefined, zoom: string, extra: Record<string, string>) {
  const sch = pay ? Number(pay.scholarship_amount || 0) : 0;
  const dn = diffNotice(pay);
  return {
    ...extra,
    이름: a.name_ko ?? "", 영문이름: a.name_en ?? "", 접수번호: a.receipt_no ?? "", 학과: deptName, 학기: t.name ?? "",
    면접일시: dtKo(iv?.scheduled_at ?? null), 면접일시_영문: dtEn(iv?.scheduled_at ?? null),
    면접순서: iv?.order_no != null ? `${iv.order_no}번` : "추후 안내", 면접순서_영문: iv?.order_no != null ? `No. ${iv.order_no}` : "TBA",
    줌주소: zoom || "추후 안내 (TBA)",
    등록금: wonKo(pay?.tuition_amount), 등록금_영문: wonEn(pay?.tuition_amount),
    장학금종류: a.scholarship_type || "없음", 장학금종류_영문: a.scholarship_type || "None",
    장학금: sch ? wonKo(sch) : "0원", 장학금_영문: sch ? wonEn(sch) : "KRW 0",
    납부금액: wonKo(pay?.payable_amount), 납부금액_영문: wonEn(pay?.payable_amount),
    등록기간: t.register_start ? `${dKo(t.register_start)} ~ ${dKo(t.register_end)}` : "추후 안내",
    등록기간_영문: t.register_start ? `${dEn(t.register_start)} – ${dEn(t.register_end)}` : "TBA",
    은행명: t.bank_name ?? "", 예금주: t.account_holder ?? "", 계좌번호: t.account_no ?? "", SWIFT: t.swift_code ?? "", 은행주소: t.bank_address ?? "",
    납입금액: wonKo(pay?.paid_amount), 납입금액_영문: wonEn(pay?.paid_amount),
    납부일: dKo(pay?.paid_at ?? null), 납부일_영문: dEn(pay?.paid_at ?? null),
    입학일: dKo(t.entry_date ?? null), 입학일_영문: dEn(t.entry_date ?? null),
    차액안내: dn.ko, 차액안내_영문: dn.en,
  } as Record<string, string>;
}

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const linkify = (h: string) => h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
// 값이 빈 항목만 있던 줄이 남기는 빈 줄은 하나로 줄입니다
const fill = (tpl: string, v: Record<string, string>) => tpl.replace(/\{([^{}]+)\}/g, (m, k) => (k in v ? v[k] : m)).replace(/\n{3,}/g, "\n\n");
const okUrl = (u: unknown) => typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u) && u.length < 500;

type Att = { filename: string; base64: string };

/* ---------- 메일 조립 (MIME) ----------
   한글 제목·이름은 RFC 2047 base64 단위로 나눠 줄을 접고, 본문·첨부는 base64 76자 줄로 씁니다.
   (외부 메일 라이브러리 없이 직접 조립 — 긴 한글 제목이 깨지던 문제 해결) */
const te = new TextEncoder(), td = new TextDecoder();
function b64Bytes(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const b64Str = (s: string) => b64Bytes(te.encode(s));
const wrap76 = (s: string) => s.replace(/\s+/g, "").replace(/.{1,76}/g, "$&\r\n");
function encWord(str: string) {
  if (/^[\x20-\x7e]*$/.test(str)) return str;
  const parts: string[] = [];
  let cur = "";
  for (const ch of str) {
    if (te.encode(cur + ch).length > 36) { parts.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts.map((w) => `=?UTF-8?B?${b64Str(w)}?=`).join("\r\n ");
}
function parseAddr(s: string) {
  const m = s.match(/^\s*(.*?)\s*<([^<>\s]+)>\s*$/);
  return m ? { name: m[1].replace(/^"|"$/g, "").trim(), addr: m[2] } : { name: "", addr: s.trim() };
}
function fmtAddr(s: string) {
  const { name, addr } = parseAddr(s);
  if (!name) return addr;
  if (/^[\x20-\x7e]*$/.test(name)) return `"${name.replace(/["\\]/g, "")}" <${addr}>`;
  return `${encWord(name)} <${addr}>`;
}
function buildMime(o: { from: string; to: string; cc: string[]; replyTo?: string; subject: string; text: string; html: string; atts: Att[] }) {
  const id = crypto.randomUUID().replace(/-/g, "");
  const alt = `alt_${id}`, mix = `mix_${id}`;
  const domain = parseAddr(o.from).addr.split("@")[1] || "localhost";
  const head = [
    `From: ${fmtAddr(o.from)}`,
    `To: ${o.to}`,
    ...(o.cc.length ? [`Cc: ${o.cc.join(", ")}`] : []),
    ...(o.replyTo ? [`Reply-To: ${fmtAddr(o.replyTo)}`] : []),
    `Subject: ${encWord(o.subject)}`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${id}@${domain}>`,
    "MIME-Version: 1.0",
  ];
  const altBody =
    `--${alt}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64Str(o.text))}` +
    `--${alt}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64Str(o.html))}` +
    `--${alt}--\r\n`;
  if (!o.atts.length) return [...head, `Content-Type: multipart/alternative; boundary="${alt}"`].join("\r\n") + "\r\n\r\n" + altBody;
  let body = `--${mix}\r\nContent-Type: multipart/alternative; boundary="${alt}"\r\n\r\n${altBody}`;
  for (const a of o.atts) {
    body += `--${mix}\r\nContent-Type: application/pdf; name="${a.filename}"\r\nContent-Disposition: attachment; filename="${a.filename}"\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n${wrap76(a.base64)}`;
  }
  body += `--${mix}--\r\n`;
  return [...head, `Content-Type: multipart/mixed; boundary="${mix}"`].join("\r\n") + "\r\n\r\n" + body;
}

/* ---------- SMTP 발송 (SSL 465) ---------- */
async function smtpSend(fromAddr: string, rcpts: string[], message: string) {
  const conn = await Deno.connectTls({ hostname: env("SMTP_HOST"), port: Number(env("SMTP_PORT") || 465) });
  let buf = "";
  const chunk = new Uint8Array(8192);
  const read = async (): Promise<{ code: number; text: string }> => {
    for (;;) {
      const lines = buf.split("\r\n");
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3}( |$)/.test(lines[i])) {
          const text = lines.slice(0, i + 1).join("\n");
          buf = lines.slice(i + 1).join("\r\n");
          return { code: Number(lines[i].slice(0, 3)), text };
        }
      }
      const n = await conn.read(chunk);
      if (n === null) throw new Error("메일 서버 연결이 끊겼습니다.");
      buf += td.decode(chunk.subarray(0, n), { stream: true });
    }
  };
  const write = async (s: string) => { let p = te.encode(s); while (p.length) p = p.subarray(await conn.write(p)); };
  const cmd = async (line: string | null, ok: number[], label = "") => {
    if (line !== null) await write(line + "\r\n");
    const r = await read();
    if (!ok.includes(r.code)) throw new Error(`메일 서버 오류${label ? ` (${label})` : ""}: ${r.text.replace(/\n/g, " ").slice(0, 200)}`);
    return r;
  };
  const timer = setTimeout(() => { try { conn.close(); } catch { /* 무시 */ } }, 60_000);
  try {
    await cmd(null, [220], "연결");
    await cmd("EHLO inha-intl-admission", [250], "EHLO");
    await cmd("AUTH LOGIN", [334], "로그인");
    await cmd(b64Str(env("SMTP_USER")), [334], "로그인");
    await cmd(b64Str(env("SMTP_PASS")), [235], "로그인 — SMTP_USER / SMTP_PASS(앱 비밀번호)를 확인하세요");
    await cmd(`MAIL FROM:<${fromAddr}>`, [250], "보낸 사람");
    for (const r of rcpts) await cmd(`RCPT TO:<${r}>`, [250, 251], `받는 사람 ${r}`);
    await cmd("DATA", [354], "DATA");
    const dotted = message.replace(/\r\n\./g, "\r\n..");
    await cmd(dotted + ".", [250], "본문 전송");
    await cmd("QUIT", [221]).catch(() => {});
  } finally {
    clearTimeout(timer);
    try { conn.close(); } catch { /* 이미 닫힘 */ }
  }
}

async function sendMail(to: string, cc: string[], subject: string, text: string, atts: Att[] = []) {
  const from = env("MAIL_FROM");
  const replyTo = env("MAIL_REPLY_TO") || undefined;
  const html = `<div style="font-family:'Malgun Gothic',Arial,sans-serif;font-size:14px;line-height:1.7;color:#111">${linkify(escHtml(text)).replace(/\n/g, "<br>")}</div>`;
  if (env("RESEND_API_KEY")) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], ...(cc.length ? { cc } : {}), subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}),
        ...(atts.length ? { attachments: atts.map((x) => ({ filename: x.filename, content: x.base64 })) } : {}) }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return;
  }
  const msg = buildMime({ from, to, cc, replyTo, subject, text: text.replace(/\r?\n/g, "\r\n"), html, atts });
  await smtpSend(parseAddr(from).addr, [to, ...cc], msg);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  if (!env("MAIL_FROM") || !(env("RESEND_API_KEY") || (env("SMTP_HOST") && env("SMTP_USER") && env("SMTP_PASS")))) {
    return json({ error: "메일 발송 설정(Secrets)이 아직 없습니다. MAIL_FROM 과 SMTP_* 또는 RESEND_API_KEY 를 등록하세요." }, 500);
  }

  // 1) 로그인한 사용자 + 권한(총괄관리자/국제교류팀) 확인
  const url = env("SUPABASE_URL");
  const userClient = createClient(url, env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "로그인이 필요합니다." }, 401);
  const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: prof } = await admin.from("profiles").select("role,active").eq("id", user.id).maybeSingle();
  if (!prof || !prof.active || !["admin", "staff"].includes(prof.role)) return json({ error: "메일을 보낼 권한이 없습니다." }, 403);

  // 2) 요청 내용
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "잘못된 요청입니다." }, 400); }
  const kind = String(body.kind ?? "면접안내");
  if (!KINDS[kind]) return json({ error: `알 수 없는 메일 종류: ${kind}` }, 400);
  const ids: string[] = Array.isArray(body.applicant_ids) ? body.applicant_ids.map(String).slice(0, MAX_PER_CALL) : [];
  const subjectTpl = String(body.subject ?? "").slice(0, 300);
  const bodyTpl = String(body.body ?? "").slice(0, 20000);
  const zoomDefault = okUrl(body.zoom_default) ? body.zoom_default : "";
  const zoomByDept: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.zoom_by_dept ?? {})) if (okUrl(v)) zoomByDept[String(k)] = v as string;
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.extra ?? {})) extra[String(k).slice(0, 30)] = String(v ?? "").slice(0, 1000);
  const testTo = body.test === true ? (user.email ?? "") : "";
  const includeCc = body.include_cc === true && !testTo;
  // 첨부: { [지원자ID]: [{ filename, base64 }, …] } — PDF만, 1개당 5MB 이하, 지원자당 4개까지
  const attOf: Record<string, Att[]> = {};
  for (const [k, v] of Object.entries(body.attachments ?? {})) {
    const list = (Array.isArray(v) ? v : [v]).slice(0, 4);
    attOf[String(k)] = [];
    for (const x of list as any[]) {
      const b64 = String(x?.base64 ?? "");
      const name = String(x?.filename ?? "document.pdf").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100);
      if (!b64.startsWith("JVBER") || b64.length > 7_000_000 || !/\.pdf$/i.test(name)) return json({ error: "첨부 파일은 5MB 이하 PDF만 가능합니다." }, 400);
      attOf[String(k)].push({ filename: name, base64: b64 });
    }
  }
  if (!ids.length || !subjectTpl || !bodyTpl) return json({ error: "대상자, 제목, 본문이 필요합니다." }, 400);

  // 3) 지원자·학기·학과·면접·납부 정보 (DB 값만 사용)
  const baseCols = "id,term_id,receipt_no,name_ko,name_en,email,department_id,status,scholarship_type";
  let { data: apps, error: e1 } = await admin.from("applicants").select(baseCols + ",cc_emails").in("id", ids);
  if (e1 && /cc_emails/.test(e1.message)) ({ data: apps, error: e1 } = await admin.from("applicants").select(baseCols).in("id", ids));
  if (e1) return json({ error: e1.message }, 500);
  const uniq = (xs: unknown[]) => [...new Set(xs.filter((x) => x != null))];
  const termIds = uniq((apps ?? []).map((a) => a.term_id));
  const deptIds = uniq((apps ?? []).map((a) => a.department_id));
  const [{ data: terms }, { data: depts }, { data: ivs }, { data: pays }] = await Promise.all([
    admin.from("terms").select("*").in("id", termIds.length ? termIds : [-1]),
    admin.from("departments").select("id,name_ko").in("id", deptIds.length ? deptIds : [-1]),
    admin.from("interviews").select("applicant_id,order_no,scheduled_at").in("applicant_id", ids),
    admin.from("payments").select("applicant_id,tuition_amount,scholarship_amount,payable_amount,paid_amount,paid_at").in("applicant_id", ids),
  ]);
  const by = (rows: Row[] | null, id: string) => rows?.find((r) => String(r.applicant_id) === String(id));

  const results: { id: string; ok: boolean; to?: string; error?: string }[] = [];
  for (const a of apps ?? []) {
    const pay = by(pays, a.id);
    const bad = KINDS[kind](a, pay);
    if (bad && !testTo) { results.push({ id: a.id, ok: false, error: bad }); continue; }
    const to = testTo || (a.email ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { results.push({ id: a.id, ok: false, error: "이메일 없음/형식 오류" }); continue; }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cc = includeCc ? String(a.cc_emails ?? "").split(/[\s,;]+/).filter((e) => emailRe.test(e) && e !== to).slice(0, 3) : [];
    const t = terms?.find((x) => x.id === a.term_id) ?? {};
    const vars = buildVars(a, t, depts?.find((d) => d.id === a.department_id)?.name_ko ?? "", by(ivs, a.id), pay,
      zoomByDept[String(a.department_id)] || zoomDefault, extra);
    const subject = (testTo ? "[테스트] " : "") + fill(subjectTpl, vars);
    const text = fill(bodyTpl, vars);
    try {
      await sendMail(to, cc, subject, text, attOf[String(a.id)] ?? []);
      const toLog = cc.length ? `${to} (참조: ${cc.join(", ")})` : to;
      results.push({ id: a.id, ok: true, to: toLog });
      if (!testTo) await admin.from("mail_logs").insert({ applicant_id: a.id, kind, to_email: toLog, subject, sent_by: user.id, ok: true });
    } catch (err) {
      const msg = String((err as Error)?.message ?? err).slice(0, 300);
      results.push({ id: a.id, ok: false, to, error: msg });
      if (!testTo) await admin.from("mail_logs").insert({ applicant_id: a.id, kind, to_email: to, subject, sent_by: user.id, ok: false, error: msg });
    }
    if (testTo) break; // 테스트는 1통만
  }
  return json({ results });
});
