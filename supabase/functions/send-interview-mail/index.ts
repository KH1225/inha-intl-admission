// Supabase Edge Function: send-interview-mail
// 면접 안내 메일 일괄 발송 (국제교류원 총괄관리자 / 국제교류팀만 사용 가능)
//
// 필요한 Secrets (Supabase > Edge Functions > Secrets)
//   MAIL_FROM      보내는 사람.  예: 인하공업전문대학 국제교류팀 <itc.intl@gmail.com>
//   MAIL_REPLY_TO  (선택) 답장 받을 주소
//   방법 A — Gmail 등 SMTP:  SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_USER=계정  SMTP_PASS=앱 비밀번호
//   방법 B — Resend:         RESEND_API_KEY=re_xxx  (보내는 도메인 인증 필요)
//
// 받는 사람은 항상 DB에 저장된 지원자 이메일만 씁니다 (임의 주소로는 보낼 수 없음).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MAX_PER_CALL = 25;
const env = (k: string) => Deno.env.get(k) ?? "";

function fmtKo(iso: string | null) {
  if (!iso) return "추후 안내";
  const d = new Date(iso);
  const p = Object.fromEntries(new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}년 ${p.month}월 ${p.day}일(${p.weekday}) ${p.hour}:${p.minute}`;
}
function fmtEn(iso: string | null) {
  if (!iso) return "To be announced";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", weekday: "short", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso)) + " (KST, UTC+9)";
}
const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const linkify = (h: string) => h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
const fill = (tpl: string, v: Record<string, string>) => tpl.replace(/\{([^{}]+)\}/g, (m, k) => (k in v ? v[k] : m));
const okUrl = (u: unknown) => typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u) && u.length < 500;

async function sendMail(to: string, subject: string, text: string) {
  const from = env("MAIL_FROM");
  const replyTo = env("MAIL_REPLY_TO") || undefined;
  const html = `<div style="font-family:'Malgun Gothic',Arial,sans-serif;font-size:14px;line-height:1.7;color:#111">${linkify(escHtml(text)).replace(/\n/g, "<br>")}</div>`;
  if (env("RESEND_API_KEY")) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return;
  }
  const client = new SMTPClient({
    connection: {
      hostname: env("SMTP_HOST"), port: Number(env("SMTP_PORT") || 465), tls: true,
      auth: { username: env("SMTP_USER"), password: env("SMTP_PASS") },
    },
  });
  try {
    await client.send({ from, to, subject, content: text, html, ...(replyTo ? { replyTo } : {}) });
  } finally {
    await client.close();
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  if (!env("MAIL_FROM") || !(env("RESEND_API_KEY") || (env("SMTP_HOST") && env("SMTP_USER") && env("SMTP_PASS")))) {
    return json({ error: "메일 발송 설정(Secrets)이 아직 없습니다. MAIL_FROM 과 SMTP_* 또는 RESEND_API_KEY 를 등록하세요." }, 500);
  }

  // 1) 로그인한 사용자 확인 + 권한(총괄관리자/국제교류팀) 확인
  const url = env("SUPABASE_URL");
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "로그인이 필요합니다." }, 401);
  const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: prof } = await admin.from("profiles").select("role,active,display_name").eq("id", user.id).maybeSingle();
  if (!prof || !prof.active || !["admin", "staff"].includes(prof.role)) return json({ error: "메일을 보낼 권한이 없습니다." }, 403);

  // 2) 요청 내용
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "잘못된 요청입니다." }, 400); }
  const ids: string[] = Array.isArray(body.applicant_ids) ? body.applicant_ids.map(String).slice(0, MAX_PER_CALL) : [];
  const subjectTpl = String(body.subject ?? "").slice(0, 300);
  const bodyTpl = String(body.body ?? "").slice(0, 20000);
  const zoomDefault = okUrl(body.zoom_default) ? body.zoom_default : "";
  const zoomByDept: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.zoom_by_dept ?? {})) if (okUrl(v)) zoomByDept[String(k)] = v as string;
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.extra ?? {})) extra[String(k).slice(0, 30)] = String(v ?? "").slice(0, 500);
  const testTo = body.test === true ? (user.email ?? "") : "";
  if (!ids.length || !subjectTpl || !bodyTpl) return json({ error: "대상자, 제목, 본문이 필요합니다." }, 400);

  // 3) 지원자·학과·면접 정보 (DB 값만 사용)
  const { data: apps, error: e1 } = await admin.from("applicants")
    .select("id,receipt_no,name_ko,name_en,email,department_id,status").in("id", ids);
  if (e1) return json({ error: e1.message }, 500);
  const deptIds = [...new Set((apps ?? []).map((a) => a.department_id).filter(Boolean))];
  const { data: depts } = await admin.from("departments").select("id,name_ko").in("id", deptIds.length ? deptIds : [-1]);
  const { data: ivs } = await admin.from("interviews").select("applicant_id,order_no,scheduled_at").in("applicant_id", ids);
  const deptName = (id: number) => depts?.find((d) => d.id === id)?.name_ko ?? "";
  const ivOf = (id: string) => ivs?.find((r) => String(r.applicant_id) === String(id));

  const results: { id: string; ok: boolean; to?: string; error?: string }[] = [];
  for (const a of apps ?? []) {
    const to = testTo || (a.email ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { results.push({ id: a.id, ok: false, error: "이메일 없음/형식 오류" }); continue; }
    const iv = ivOf(a.id);
    const zoom = zoomByDept[String(a.department_id)] || zoomDefault;
    const vars: Record<string, string> = {
      ...extra,
      이름: a.name_ko ?? "", 영문이름: a.name_en ?? "", 접수번호: a.receipt_no ?? "", 학과: deptName(a.department_id),
      면접일시: fmtKo(iv?.scheduled_at ?? null), 면접일시_영문: fmtEn(iv?.scheduled_at ?? null),
      면접순서: iv?.order_no != null ? `${iv.order_no}번` : "추후 안내", 면접순서_영문: iv?.order_no != null ? `No. ${iv.order_no}` : "TBA",
      줌주소: zoom || "추후 안내 (TBA)",
    };
    const subject = (testTo ? "[테스트] " : "") + fill(subjectTpl, vars);
    const text = fill(bodyTpl, vars);
    try {
      await sendMail(to, subject, text);
      results.push({ id: a.id, ok: true, to });
      if (!testTo) await admin.from("mail_logs").insert({ applicant_id: a.id, kind: "면접안내", to_email: to, subject, sent_by: user.id, ok: true });
    } catch (err) {
      const msg = String((err as Error)?.message ?? err).slice(0, 300);
      results.push({ id: a.id, ok: false, to, error: msg });
      if (!testTo) await admin.from("mail_logs").insert({ applicant_id: a.id, kind: "면접안내", to_email: to, subject, sent_by: user.id, ok: false, error: msg });
    }
    if (testTo) break; // 테스트는 1통만
  }
  return json({ results });
});
