import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { Client } from "pg";

// These tests write synthetic rows. They may run ONLY in CI's local ephemeral DB.
const url = process.env.DATABASE_URL;
let ephemeral = false;
try {
  const parsed = new URL(url);
  ephemeral =
    process.env.CI === "true" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) &&
    parsed.pathname === "/firesync_test";
} catch {
  /* No configuration: skip without connecting. */
}
const hash = () => createHash("sha256").update(randomUUID()).digest("hex");

test(
  "agent: RLS, session ownership, quotas and retention in ephemeral PostgreSQL",
  {
    skip: !ephemeral
      ? "Requires CI=true and a local firesync_test database"
      : false,
  },
  async (t) => {
    const db = new Client({
      connectionString: url,
      connectionTimeoutMillis: 5000,
    });
    await db.connect();
    try {
      const roles = await db.query(
        "select rolname from pg_roles where rolname in ('anon','authenticated','service_role')",
      );
      assert.equal(
        roles.rowCount,
        3,
        "CI must create all three Supabase roles before migrating",
      );

      async function transaction(body) {
        await db.query("begin");
        try {
          await body();
        } finally {
          await db.query("rollback");
        }
      }
      async function denied(sql, params = [], expected = "42501") {
        await db.query("savepoint expected_denial");
        let failure;
        try {
          await db.query(sql, params);
        } catch (error) {
          failure = error;
        }
        await db.query("rollback to savepoint expected_denial");
        assert.equal(
          failure?.code,
          expected,
          "Operation must fail with the expected PostgreSQL code",
        );
      }
      async function open(token = hash(), ip = hash(), expected = null) {
        const result = await db.query(
          "select * from public.agent_open_chat($1,$2,'mock','DEMO-db-test',$3)",
          [token, ip, expected],
        );
        return result.rows[0];
      }

      await t.test(
        "anonymous cannot read audit tables or invoke server-only functions",
        () =>
          transaction(async () => {
            await db.query("set local role anon");
            for (const table of [
              "agent_sessions",
              "agent_runs",
              "agent_messages",
              "agent_tool_calls",
            ])
              await denied(`select * from public.${table}`);
            await denied(
              "select * from public.agent_open_chat($1,$2,'mock','DEMO-db-test',null)",
              [hash(), hash()],
            );
            await denied("select * from public.agent_chat_history($1)", [
              randomUUID(),
            ]);
            await denied("select public.agent_apply_retention()");
          }),
      );

      await t.test(
        "authenticated users see only their own runs; client role claims do not elevate access",
        () =>
          transaction(async () => {
            const user = randomUUID();
            const other = randomUUID();
            const runIds = [];
            for (const owner of [user, other, null]) {
              const result = await db.query(
                "insert into public.agent_runs(user_id,provider,model,status) values($1,'mock','DEMO-db-test','completed') returning id",
                [owner],
              );
              const id = result.rows[0].id;
              runIds.push(id);
              await db.query(
                "insert into public.agent_messages(run_id,role,content) values($1,'user',$2::jsonb)",
                [id, JSON.stringify({ text: "DEMO synthetic audit fixture" })],
              );
              await db.query(
                "insert into public.agent_tool_calls(run_id,tool,input,output,policy_decision) values($1,'DEMO_read','{}','{}','allowed')",
                [id],
              );
            }
            await db.query("set local role authenticated");
            await db.query("select set_config('request.jwt.claims',$1,true)", [
              JSON.stringify({
                sub: user,
                user_metadata: { role: "admin" },
                app_metadata: { role: "user" },
              }),
            ]);
            assert.deepEqual(
              (
                await db.query(
                  "select id from public.agent_runs where id=any($1::uuid[])",
                  [runIds],
                )
              ).rows.map((row) => row.id),
              [runIds[0]],
            );
            for (const table of ["agent_messages", "agent_tool_calls"])
              assert.deepEqual(
                (
                  await db.query(
                    `select run_id from public.${table} where run_id=any($1::uuid[])`,
                    [runIds],
                  )
                ).rows.map((row) => row.run_id),
                [runIds[0]],
              );
            await denied("select * from public.agent_sessions");
            await denied(
              "insert into public.agent_runs(provider,model) values('mock','DEMO')",
            );
            await denied("select public.agent_apply_retention()");
            await denied("select * from public.agent_chat_history($1)", [
              randomUUID(),
            ]);
            for (const role of ["coordinator", "admin"]) {
              await db.query(
                "select set_config('request.jwt.claims',$1,true)",
                [JSON.stringify({ sub: user, app_metadata: { role } })],
              );
              for (const table of [
                "agent_runs",
                "agent_messages",
                "agent_tool_calls",
              ]) {
                const column = table === "agent_runs" ? "id" : "run_id";
                assert.equal(
                  (
                    await db.query(
                      `select * from public.${table} where ${column}=any($1::uuid[])`,
                      [runIds],
                    )
                  ).rowCount,
                  3,
                );
              }
            }
          }),
      );

      await t.test(
        "service role opens a session, rejects a foreign session id and blocks overlapping turns",
        () =>
          transaction(async () => {
            await db.query("set local role service_role");
            const token = hash();
            const run = await open(token);
            await denied(
              "select * from public.agent_open_chat($1,$2,'mock','DEMO',$3)",
              [hash(), hash(), run.session_id],
              "P0001",
            );
            await denied(
              "select * from public.agent_open_chat($1,$2,'mock','DEMO',null)",
              [token, hash()],
              "P0001",
            );
            await db.query(
              "update public.agent_runs set status='completed',finished_at=now() where id=$1",
              [run.id],
            );
            const next = await open(token, hash(), run.session_id);
            assert.equal(next.session_id, run.session_id);
          }),
      );

      await t.test(
        "IP quota holds across new sessions and session quota holds across IP changes",
        () =>
          transaction(async () => {
            await db.query("set local role service_role");
            const ip = hash();
            for (let i = 0; i < 10; i++) await open(hash(), ip);
            await denied(
              "select * from public.agent_open_chat($1,$2,'mock','DEMO',null)",
              [hash(), ip],
              "P0001",
            );
            const token = hash();
            for (let i = 0; i < 10; i++) {
              const run = await open(token);
              await db.query(
                "update public.agent_runs set status='completed' where id=$1",
                [run.id],
              );
            }
            await denied(
              "select * from public.agent_open_chat($1,$2,'mock','DEMO',null)",
              [token, hash()],
              "P0001",
            );
          }),
      );

      await t.test(
        "history contains only completed conversational messages from the requested session",
        () =>
          transaction(async () => {
            await db.query("set local role service_role");
            const token = hash();
            const run = await open(token);
            for (const [role, content] of [
              ["user", { text: "DEMO question" }],
              ["assistant", { text: "", toolCalls: [{ id: "DEMO" }] }],
              ["tool", { text: "DEMO tool data" }],
              ["assistant", { text: "DEMO answer" }],
            ])
              await db.query(
                "insert into public.agent_messages(run_id,role,content) values($1,$2,$3::jsonb)",
                [run.id, role, JSON.stringify(content)],
              );
            assert.equal(
              (
                await db.query("select * from public.agent_chat_history($1)", [
                  run.session_id,
                ])
              ).rowCount,
              0,
            );
            await db.query(
              "update public.agent_runs set status='completed' where id=$1",
              [run.id],
            );
            assert.deepEqual(
              (
                await db.query("select * from public.agent_chat_history($1)", [
                  run.session_id,
                ])
              ).rows.map((row) => row.content.text),
              ["DEMO question", "DEMO answer"],
            );
            assert.equal(
              (
                await db.query("select * from public.agent_chat_history($1)", [
                  randomUUID(),
                ])
              ).rowCount,
              0,
            );
          }),
      );

      await t.test(
        "retention removes expired anonymous text and IP hashes without deleting current messages",
        () =>
          transaction(async () => {
            const run = await open();
            await db.query(
              "update public.agent_runs set started_at=now()-interval '31 days',status='completed' where id=$1",
              [run.id],
            );
            await db.query(
              "update public.agent_sessions set last_seen_at=now()-interval '31 days' where id=$1",
              [run.session_id],
            );
            await db.query(
              "insert into public.agent_messages(run_id,role,content,created_at) values($1,'user','{\"text\":\"DEMO expired\"}',now()-interval '31 days')",
              [run.id],
            );
            const current = await open();
            await db.query(
              "insert into public.agent_messages(run_id,role,content) values($1,'user','{\"text\":\"DEMO current\"}')",
              [current.id],
            );
            await db.query("set local role service_role");
            await db.query("select public.agent_apply_retention()");
            assert.equal(
              (
                await db.query(
                  "select * from public.agent_messages where run_id=$1",
                  [run.id],
                )
              ).rowCount,
              0,
            );
            assert.equal(
              (
                await db.query(
                  "select * from public.agent_messages where run_id=$1",
                  [current.id],
                )
              ).rowCount,
              1,
            );
            const old = (
              await db.query(
                "select session_id,ip_hash from public.agent_runs where id=$1",
                [run.id],
              )
            ).rows[0];
            assert.equal(old.session_id, null);
            assert.equal(old.ip_hash, null);
          }),
      );
    } finally {
      await db.end();
    }
  },
);
