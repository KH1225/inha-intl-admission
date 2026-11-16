// Supabase Edge Function: pii-crypt
// 지원자 이메일·연락처·추가 이메일을 AES-256-GCM 으로 암호화/복호화합니다.
//
// ■ 암호화 열쇠는 DB 에 없습니다.
//   열쇠는 Edge Functions > Secrets 의 PII_KEY 에만 있고, 이 함수 안에서만 씁니다.
//   그래서 DB 가 통째로 유출되거나 SQL 로 뚫려도, DB 에는 'enc:v1:…' 암호문만 있어 읽을 수 없습니다.
//
// ■ 권한
//   - encrypt : 총괄관리자·국제교류팀 (저장하기 전에 암호문으로 바꿈)
//   - decrypt : 로그인한 사용자 본인의 권한(RLS)으로 DB 에서 읽을 수 있는 지원자만 풀어 줌
//               → 학과장 등 권한 없는 사람은 지금처럼 볼 수 없음. 임의의 암호문은 풀어 주지 않음.
//   - migrate / status : 총괄관리자만 (기존 평문 자료를 한 번에 암호화 / 남은 평문 개수 확인)
//
// 필요한 Secrets: PII_KEY (32바이트 무작위 값을 base64 로 — 만드는 방법은 README.md)
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY 는 Supabase 가 자동으로 넣어 줍니다.
// ※ PII_KEY 를 잃어버리면 암호화된 이메일·연락처는 영영 되살릴 수 없습니다. 반드시 안전한 곳에 사본을 보관하세요.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const env = (k: string) => Deno.env.get(k) ?? "";

const PREFIX = "enc:v1:";
const FIELDS = ["email", "phone", "cc_emails"] as const;
const isEnc = (v: unknown) => typeof v === "string" && v.startsWith(PREFIX);

/* ---------- AES-256-GCM ---------- */
let keyP: Promise<CryptoKey> | null = null;
function getKey(): Promise<CryptoKey> {
  if (!keyP) {
    keyP = (async () => {
      let raw: Uint8Array;
      try { raw = Uint8Array.from(atob(env("PII_KEY").trim()), (c) => c.charCodeAt(0)); } catch { raw = new Uint8Array(); }
      if (raw.length !== 32) throw new Error("PII_KEY 가 없거나 형식이 틀렸습니다 (32바이트 base64 값이어야 합니다).");
      return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    })();
    keyP.catch(() => { keyP = null; });
  }
  return keyP;
}
const b64 = (u: Uint8Array) => { let s = ""; for (const x of u) s += String.fromCharCode(x); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function enc(v: unknown): Promise<string | null> {
  if (v == null || v === "") return null;
  const s = String(v);
  if (isEnc(s)) return s; // 이미 암호문
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await getKey(), new TextEncoder().encode(s)));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return PREFIX + b64(out);
}
async function dec(v: unknown): Promise<string | null> {
  if (v == null || v === "") return null;
  const s = String(v);
  if (!isEnc(s)) return s; // 아직 전환 전 평문
  const raw = unb64(s.slice(PREFIX.length));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, await getKey(), raw.slice(12));
  return new TextDecoder().decode(pt);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // 1) 로그인 사용자 + 권한
  const url = env("SUPABASE_URL");
  const userClient = createClient(url, env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "로그인이 필요합니다." }, 401);
  const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: prof } = await admin.from("profiles").select("role,active").eq("id", user.id).maybeSingle();
  if (!prof || !prof.active) return json({ error: "권한이 없습니다." }, 403);
  const role = String(prof.role);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "잘못된 요청입니다." }, 400); }
  const action = String(body?.action ?? "");

  try {
    await getKey(); // 열쇠 설정부터 확인

    // 2-a) 저장 전 암호화: { items: [{ email, phone, cc_emails }, …] }
    if (action === "encrypt") {
      if (!["admin", "staff"].includes(role)) return json({ error: "수정 권한이 없습니다." }, 403);
      const items = Array.isArray(body.items) ? body.items.slice(0, 500) : [];
      const out = [];
      for (const it of items) {
        const o: Record<string, string | null> = {};
        for (const f of FIELDS) if (it && f in it) o[f] = await enc(it[f]);
        out.push(o);
      }
      return json({ items: out });
    }

    // 2-b) 복호화: { ids: [...] } — 사용자 본인 권한(RLS)으로 읽히는 지원자만
    if (action === "decrypt") {
      const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 2000) : [];
      if (!ids.length) return json({ rows: [] });
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const part = ids.slice(i, i + 200);
        let r = await userClient.from("applicants").select("id,email,phone,cc_emails").in("id", part);
        if (r.error && /cc_emails/.test(r.error.message)) r = await userClient.from("applicants").select("id,email,phone").in("id", part);
        if (r.error) return json({ error: "연락처를 볼 권한이 없습니다." }, 403);
        for (const a of r.data ?? []) {
          const o: Record<string, unknown> = { id: a.id };
          for (const f of FIELDS) if (f in a) { try { o[f] = await dec((a as any)[f]); } catch { o[f] = null; } }
          rows.push(o);
        }
      }
      return json({ rows });
    }

    // 2-c) 남은 평문 개수 / 기존 자료 일괄 암호화 (총괄관리자만)
    if (action === "status" || action === "migrate") {
      if (role !== "admin") return json({ error: "총괄관리자만 할 수 있습니다." }, 403);
      const run = action === "migrate";
      const all: any[] = [];
      for (let from = 0; ; from += 1000) {
        let r = await admin.from("applicants").select("id,email,phone,cc_emails").order("id").range(from, from + 999);
        if (r.error && /cc_emails/.test(r.error.message)) r = await admin.from("applicants").select("id,email,phone").order("id").range(from, from + 999);
        if (r.error) throw r.error;
        all.push(...(r.data ?? []));
        if ((r.data ?? []).length < 1000) break;
      }
      let plainApps = 0, doneApps = 0;
      for (const a of all) {
        const p: Record<string, string | null> = {};
        for (const f of FIELDS) if (f in a && a[f] != null && a[f] !== "" && !isEnc(a[f])) p[f] = await enc(a[f]);
        if (!Object.keys(p).length) continue;
        plainApps++;
        if (!run) continue;
        // 맞게 암호화됐는지 풀어서 원문과 비교한 뒤 저장
        for (const f of Object.keys(p)) if ((await dec(p[f])) !== String(a[f])) throw new Error(`암호화 검증 실패 (지원자 ${a.id})`);
        const u = await admin.from("applicants").update(p).eq("id", a.id);
        if (u.error) throw u.error;
        doneApps++;
      }
      // 메일 발송 기록의 받는 주소
      let plainLogs = 0, doneLogs = 0;
      const ml = await admin.from("mail_logs").select("id,to_email").not("to_email", "is", null).not("to_email", "like", PREFIX + "%").limit(5000);
      if (!ml.error) {
        plainLogs = (ml.data ?? []).length;
        if (run) for (const r of ml.data ?? []) {
          const u = await admin.from("mail_logs").update({ to_email: await enc(r.to_email) }).eq("id", r.id);
          if (u.error) throw u.error;
          doneLogs++;
        }
      }
      return json({ total: all.length, plain_applicants: plainApps - doneApps, plain_mail_logs: plainLogs - doneLogs, encrypted_now: { applicants: doneApps, mail_logs: doneLogs } });
    }

    return json({ error: "알 수 없는 요청입니다." }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e).slice(0, 300) }, 500);
  }
});
