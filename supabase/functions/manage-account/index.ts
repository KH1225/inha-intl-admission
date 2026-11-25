// Supabase Edge Function: manage-account
// 총괄관리자가 현황판 계정 관리 화면에서 계정을 만들고 비밀번호를 지정합니다.
//  - create:       { action, emp_no, display_name, role, department_id?, password, email? }
//  - set_password: { action, user_id, password }
//  - delete:       { action, user_id }  (본인 제외, 면접 평가·학점인정 기록이 없는 계정만)
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
// 비밀번호 규칙: 숫자 6자리 또는 영문+숫자 8자 이상. 같은 숫자 반복·연속 숫자·짝 반복(121212 등)은 거절
const weakPin = (p: string) => /^(\d)\1{5}$/.test(p) || /^(\d\d)\1\1$/.test(p) || /^(\d{3})\1$/.test(p) ||
  "0123456789".includes(p) || "9876543210".includes(p);
const pwOk = (p: string) => typeof p === "string" && p.length <= 72 &&
  ((/^\d{6}$/.test(p) && !weakPin(p)) || (p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p)));
const PW_RULE = "비밀번호는 숫자 6자리 또는 영문과 숫자를 섞은 8자 이상으로 정해 주세요. (111111, 123456, 121212 같은 쉬운 숫자는 쓸 수 없습니다)";

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
  if (b.action === "delete") {
    const id = String(b.user_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "계정을 찾을 수 없습니다." }, 400);
    if (id === who.user.id) return json({ error: "본인 계정은 삭제할 수 없습니다." }, 400);
    const { data: prof } = await admin.from("profiles").select("*").eq("id", id).maybeSingle();
    if (!prof) return json({ error: "현황판 계정이 아닙니다." }, 404);

    // 이 계정으로 남긴 업무 기록(면접 평가·서명, 학점인정 심의)이 있으면 삭제하지 않고 '사용 중지'를 안내
    const count = async (table: string, col: string) => {
      const { count, error } = await admin.from(table).select("*", { count: "exact", head: true }).eq(col, id);
      return error ? 0 : (count ?? 0); // 표·칸이 아직 없는 경우는 0건으로 봅니다
    };
    const nEval = Math.max(await count("interview_evaluations", "evaluated_by"), await count("interview_evaluations", "evaluator_id"));
    const nCredit = await count("credit_reviews", "reviewer");
    if (nEval + nCredit > 0) {
      const parts = [nEval ? `면접 평가 ${nEval}건` : "", nCredit ? `학점인정 심의 ${nCredit}건` : ""].filter(Boolean).join(", ");
      return json({ error: `이 계정으로 남긴 기록(${parts})이 있어 삭제할 수 없습니다. 기록 보존을 위해 '사용' 체크를 해제해 사용 중지해 주세요.` }, 409);
    }

    // 면접위원 배정 → 권한 → 로그인 계정 순서로 지우고, 중간에 실패하면 되돌립니다
    const { data: panels } = await admin.from("interview_panels").select("*").eq("profile_id", id);
    const restorePanels = async () => {
      if (panels && panels.length) await admin.from("interview_panels").insert(panels.map(({ id: _x, ...r }: any) => r));
    };
    if (panels && panels.length) await admin.from("interview_panels").delete().eq("profile_id", id);
    const { error: pe } = await admin.from("profiles").delete().eq("id", id);
    if (pe) {
      await restorePanels();
      return json({ error: "다른 기록과 연결되어 있어 삭제할 수 없습니다. '사용' 체크를 해제해 사용 중지해 주세요. (" + pe.message + ")" }, 409);
    }
    const { error: de } = await admin.auth.admin.deleteUser(id);
    if (de) {
      await admin.from("profiles").upsert(prof, { onConflict: "id" });
      await restorePanels();
      return json({ error: "다른 기록과 연결되어 있어 삭제할 수 없습니다. '사용' 체크를 해제해 사용 중지해 주세요. (" + de.message + ")" }, 409);
    }
    return json({ ok: true });
  }
  return json({ error: "알 수 없는 요청입니다." }, 400);
});
