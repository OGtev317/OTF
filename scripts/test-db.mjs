import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
// Isolated, disposable PostgreSQL. No ports, host directories, or real account data.
const name = `otf-policy-test-${randomUUID()}`;
function docker(args, input) {
  const result = spawnSync("docker", args, {
    input,
    encoding: "utf8",
    maxBuffer: 2e6,
  });
  if (result.status !== 0)
    throw new Error(result.stderr || result.stdout || "Docker command failed");
  return result.stdout;
}
try {
  docker([
    "run",
    "--detach",
    "--rm",
    "--name",
    name,
    "--network",
    "none",
    "--env",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:17",
  ]);
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      docker(["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (!ready) throw new Error("Test database did not become ready");
  const bootstrap = `create role anon nologin; create role authenticated nologin; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`;
  const sql =
    bootstrap +
    "\n" +
    readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter(f=>f.endsWith('.sql')).sort().map(f=>readFileSync(new URL('../supabase/migrations/'+f,import.meta.url),'utf8')).join('\n') +
    "\n" +
    readFileSync(
      new URL("../supabase/tests/isolation.sql", import.meta.url),
      "utf8",
    ) + '\n' + readFileSync(new URL('../supabase/tests/community.sql',import.meta.url),'utf8');
  docker(
    [
      "exec",
      "-i",
      name,
      "psql",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-q",
    ],
    sql,
  );
  console.log(
    "PASS: PostgreSQL family isolation and Community public reads, opt-in, ownership, blocks, reports, moderation, limits, and pagination.",
  );
} finally {
  // Only the exact unique container created by this invocation is removed.
  spawnSync("docker", ["rm", "-f", name], { stdio: "ignore" });
}
