// Supabase Edge Function: manage-account
// 총괄관리자가 현황판 계정 관리 화면에서 계정을 만들고 비밀번호를 지정합니다.
//  - create:       { action, emp_no, display_name, role, department_id?, password, email? }
//  - set_password: { action, user_id, password }
// 호출한 사람이 '사용 중인 총괄관리자'일 때만 동작합니다. 비밀번호는 기록하지 않습니다.
// 배포: Edge Functions > Deploy a new function > 이름 manage-account (Verify JWT 는 켠 그대로 둡니다)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const env = (k: string) => Deno.env.get(k) ?? "";
const ROLES = ["admin", "staff", "viewer", "director", "dept"];
const pwOk = (p: string) => typeof p === "string" && p.length >= 8 && p.length <= 72 && /[A-Za-z]/.test(p) && /\d/.test(p);
const PW_RULE = "비밀번호는 8자 이상, 영문과 숫자를 함께 넣어 주세요.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const url = env("SUPABASE_URL");
  const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });

  // 1) 호출한 사람 확인: 로그인 + 사용 중인 총괄관리자
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = await admin.auth.getUser(token);
  if (!who?.user) return json({ error: "로그인이 필요합니다." }, 401);
  const { data: me } = await admin.from("profiles").select("role,active").eq("id", who.user.id).maybeSingle();
  if (!me || me.role !== "admin" || me.active === false) return json({ error: "총괄관리자만 계정을 관리할 수 있습니다." }, 403);

  let b: any;
  try { b = await req.json(); } catch { return json({ error: "잘못된 요청입니다." }, 400); }

  if (b.action === "set_password") {
    const id = String(b.user_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "계정을 찾을 수 없습니다." }, 400);
    if (!pwOk(b.password)) return json({ error: PW_RULE }, 400);
    const { data: prof } = await admin.from("profiles").select("id").eq("id", id).maybeSingle();
    if (!prof) return json({ error: "현황판 계정이 아닙니다." }, 404);
    const { error } = await admin.auth.admin.updateUserById(id, { password: b.password });
    if (error) return json({ error: "비밀번호를 바꾸지 못했습니다: " + error.message }, 400);
    return json({ ok: true });
  }

  if (b.action === "create") {
    const emp = String(b.emp_no ?? "").replace(/\s/g, "");
    const name = String(b.display_name ?? "").trim();
    const role = String(b.role ?? "");
    const dept = b.department_id ? Number(b.department_id) : null;
    if (!/^[A-Za-z0-9-]{1,30}$/.test(emp)) return json({ error: "직번을 확인하세요. (영문·숫자)" }, 400);
    if (!name) return json({ error: "이름을 입력하세요." }, 400);
    if (!ROLES.includes(role)) return json({ error: "권한을 확인하세요." }, 400);
    if (role === "dept" && !dept) return json({ error: "학과장은 학과를 선택해야 합니다." }, 400);
    if (!pwOk(b.password)) return json({ error: PW_RULE }, 400);
    const { data: dup } = await admin.from("profiles").select("id").eq("emp_no", emp).maybeSingle();
    if (dup) return json({ error: "이미 다른 계정에 등록된 직번입니다." }, 409);

    // 로그인은 직번으로만 하므로, 이메일을 따로 주지 않으면 직번으로 내부용 주소를 만듭니다 (메일은 가지 않음)
    const email = String(b.email ?? "").trim().toLowerCase() || `staff-${emp.toLowerCase()}@itc-portal.invalid`;
    const { data: cu, error: ce } = await admin.auth.admin.createUser({ email, password: b.password, email_confirm: true });
    if (ce || !cu?.user) {
      const m = ce?.message ?? "";
      return json({ error: /already|registered|exists/i.test(m) ? "이미 사용 중인 이메일입니다." : "계정을 만들지 못했습니다: " + m }, 400);
    }
    const row = { id: cu.user.id, display_name: name, role, department_id: role === "dept" ? dept : null, emp_no: emp, active: true };
    const { error: pe } = await admin.from("profiles").upsert(row, { onConflict: "id" });
    if (pe) {
      await admin.auth.admin.deleteUser(cu.user.id); // 반쯤 만들어진 계정이 남지 않게 되돌림
      return json({ error: /emp_no|duplicate/i.test(pe.message) ? "이미 다른 계정에 등록된 직번입니다." : "권한을 저장하지 못했습니다: " + pe.message }, 400);
    }
    return json({ ok: true, id: cu.user.id });
  }
  return json({ error: "알 수 없는 요청입니다." }, 400);
});
