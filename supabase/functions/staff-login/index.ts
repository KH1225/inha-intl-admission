// Supabase Edge Function: staff-login
// 직번 + 비밀번호로 로그인합니다.
// 직번에 해당하는 로그인 이메일은 서버 안에서만 찾고, 브라우저에는 절대 돌려주지 않습니다.
// 비밀번호가 맞을 때만 로그인 토큰을 돌려주고, 틀리면 직번이 있는지 없는지도 알려 주지 않습니다.
//
// 같은 직번으로 15분 안에 5번 틀리면 15분 동안 잠깁니다 (login_failures 표).
//
// ※ 이 함수는 로그인 전에 부르므로, 배포할 때 "Verify JWT"(JWT 확인)를 꺼야 합니다.
//   (비밀번호 확인은 함수가 직접 합니다)
// 필요한 Secrets: 없음 (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY 는 Supabase가 자동으로 넣어 줍니다)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const env = (k: string) => Deno.env.get(k) ?? "";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LIMIT = 5;          // 허용 실패 횟수
const WINDOW_MIN = 15;    // 잠금 시간(분)
const WRONG = "직번 또는 비밀번호가 올바르지 않습니다.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "잘못된 요청입니다." }, 400); }
  const emp = String(body?.emp_no ?? "").replace(/\s/g, "");
  const pw = String(body?.password ?? "");
  if (!/^[A-Za-z0-9-]{1,30}$/.test(emp) || !pw || pw.length > 200) return json({ error: WRONG }, 401);

  const url = env("SUPABASE_URL");
  const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });

  // 1) 잠금 확인 (오래된 실패 기록은 정리)
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  await admin.from("login_failures").delete().lt("at", new Date(Date.now() - 86_400_000).toISOString());
  const { count, error: cErr } = await admin.from("login_failures").select("id", { count: "exact", head: true }).eq("emp_no", emp).gte("at", since);
  // (login_failures 표를 만드는 SQL을 실행하기 전에는 잠금 없이 동작합니다)
  const throttle = !cErr;
  if (throttle && (count ?? 0) >= LIMIT) return json({ error: `로그인에 여러 번 실패해 ${WINDOW_MIN}분 동안 잠겼습니다. 잠시 후 다시 시도하세요.` }, 429);

  const fail = async () => {
    if (throttle) await admin.from("login_failures").insert({ emp_no: emp });
    await sleep(500);
    return json({ error: WRONG }, 401);
  };

  // 2) 직번 → 로그인 이메일 (서버 안에서만)
  const { data: email } = await admin.rpc("login_email", { p_emp_no: emp });
  if (!email) return fail();

  // 3) 비밀번호 확인
  const auth = createClient(url, env("SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await auth.auth.signInWithPassword({ email: String(email), password: pw });
  if (error || !data.session) return fail();

  if (throttle) await admin.from("login_failures").delete().eq("emp_no", emp);
  return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
});
