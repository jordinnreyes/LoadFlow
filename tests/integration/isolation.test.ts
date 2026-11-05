import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { database, ownerTransaction } from "../../server/db/client.js";
import { Academics } from "../../server/modules/academics/service.js";
import { users } from "../../server/db/schema.js";
if (
  !process.env.DATABASE_URL ||
  !process.env.SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY
)
  throw new Error("Configura la pila local para probar aislamiento real.");
const provider = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
test("real DB isolates two Auth owners, cross-owner FK, histories and optimistic edits", async () => {
  const db = database(process.env.DATABASE_URL!);
  const service = new Academics(db.pool);
  async function owner() {
    const { data, error } = await provider.auth.admin.createUser({
      email: `isolation-${randomUUID()}@fixture.test`,
      email_confirm: true,
    });
    if (error || !data.user)
      throw new Error("No se pudo crear fixture local de identidad");
    await service.ensureUser(data.user.id);
    return data.user.id;
  }
  try {
    const a = await owner(),
      b = await owner();
    assert.equal((await service.listPeriods(a, {})).items.length, 1);
    await Promise.all([service.ensureUser(a), service.ensureUser(a)]);
    assert.equal(
      (await service.listPeriods(a, {})).items.length,
      1,
      "no duplicate default period",
    );
    const period = (await service.listPeriods(a, {})).items[0];
    const otherPeriod = (await service.listPeriods(b, {})).items[0];
    const course = await service.saveCourse(
      a,
      "create-course",
      { name: "Cálculo" },
      period.id,
    );
    assert.equal(course.status, 201);
    assert.deepEqual(
      await service.saveCourse(
        a,
        "create-course",
        { name: "Cálculo" },
        period.id,
      ),
      course,
    );
    await assert.rejects(
      service.saveCourse(a, "create-course", { name: "Otro" }, period.id),
      { status: 409 },
    );
    await assert.rejects(service.listCourses(b, period.id, {}), {
      status: 404,
    });
    const id = (course.data as { id: string }).id;
    await assert.rejects(
      service.saveCourse(
        b,
        "foreign-edit",
        { name: "No permitido" },
        undefined,
        id,
        '"course-1"',
      ),
      { status: 404 },
    );
    await assert.rejects(
      ownerTransaction(db.pool, b, (c) =>
        c.query(
          "insert into app.courses(id,owner_id,period_id,name) values($1,$2,$3,$4)",
          [randomUUID(), a, period.id, "Cross owner"],
        ),
      ),
      { code: "42501" },
    );
    await assert.rejects(
      ownerTransaction(db.pool, b, (c) =>
        c.query(
          "insert into app.courses(id,owner_id,period_id,name) values($1,$2,$3,$4)",
          [randomUUID(), b, period.id, "Cross FK"],
        ),
      ),
      { code: "23503" },
    );
    await assert.rejects(
      ownerTransaction(db.pool, a, (c) =>
        c.query("update app.progress_revisions set recorded_at=now()"),
      ),
      { code: "42501" },
    );
    await assert.rejects(
      ownerTransaction(db.pool, a, (c) =>
        c.query("select * from app.client_sessions"),
      ),
      { code: "42501" },
    );
    await assert.rejects(db.pool.query("select * from auth.users"), {
      code: "42501",
    });
    const visible = await ownerTransaction(
      db.pool,
      b,
      async (c) =>
        (await c.query("select id from app.courses where id=$1", [id])).rows,
    );
    assert.deepEqual(visible, []);
    const race = await Promise.allSettled([
      service.saveCourse(
        a,
        "race-a",
        { name: "Cambio A" },
        undefined,
        id,
        '"course-1"',
      ),
      service.saveCourse(
        a,
        "race-b",
        { name: "Cambio B" },
        undefined,
        id,
        '"course-1"',
      ),
    ]);
    assert.equal(race.filter((x) => x.status === "fulfilled").length, 1);
    const rejected = race.find(
      (x) => x.status === "rejected",
    ) as PromiseRejectedResult;
    assert.equal(rejected.reason.status, 412);
    assert.equal(
      (await service.listCourses(b, otherPeriod.id, {})).items.length,
      0,
    );
    const profiles = await ownerTransaction(db.pool, a, async (c) => {
      const { drizzle } = await import("drizzle-orm/node-postgres");
      return drizzle(c).select().from(users).where(eq(users.id, b));
    });
    assert.deepEqual(profiles, []);
  } finally {
    await db.pool.end();
  }
});
