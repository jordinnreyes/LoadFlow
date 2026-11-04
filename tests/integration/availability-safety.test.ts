import test from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { fixture } from "./fixture.js";
test("fixed exams union with commitments, copied windows do not renew manual review, and source edits invalidate date proposals", async () => {
  const f = await fixture();
  try {
    const a = await f.client(),
      r = f.request,
      id = (await r(a, "GET", "/api/v1/periods")).json().items[0].id,
      url = `/api/v1/periods/${id}/availability`;
    const config = {
      confirmed: true,
      timezone: "America/Lima",
      validFrom: "2030-01-01",
      validTo: null,
      weekly: Array.from({ length: 7 }, (_, i) => ({
        weekday: i + 1,
        state: "windows",
        intervals: [{ startMinute: 540, endMinute: 720 }],
      })),
      exceptions: [],
      manualCoverage: [{ from: "2030-01-07", to: "2030-01-08" }],
      preferences: {
        minimumMinutes: 30,
        preferredMinutes: 60,
        maximumMinutes: 120,
      },
    };
    const saved = await r(a, "PUT", url, config, '"availability-0"');
    assert.equal(saved.statusCode, 200, saved.body);
    const exam = await r(a, "POST", "/api/v1/activities", {
      periodId: id,
      title: "Examen ficticio",
      type: "Examen parcial",
      dueDate: "2030-01-07",
      dueTime: "09:00",
      timezone: "America/Lima",
      evaluationEndAt: "2030-01-07T15:00:00Z",
    });
    assert.equal(exam.statusCode, 201, exam.body);
    assert.equal(
      (
        await r(a, "POST", "/api/v1/manual-commitments", {
          periodId: id,
          title: "Clase solapada ficticia",
          confirmed: true,
          timezone: "America/Lima",
          startAt: "2030-01-07T14:30:00Z",
          endAt: "2030-01-07T16:00:00Z",
        })
      ).statusCode,
      201,
    );
    const cap = (
      await r(
        a,
        "GET",
        `/api/v1/periods/${id}/capacity?from=2030-01-07&to=2030-01-08`,
      )
    ).json();
    assert.equal(cap.availableMinutes, 60);
    assert.equal(cap.occupied.length, 1);
    const proposal = await r(
      a,
      "POST",
      `/api/v1/activities/${exam.json().id}/date-change-proposals`,
      {
        dueDate: "2030-01-08",
        evaluationEndAt: "2030-01-08T15:00:00Z",
        source: { kind: "manual" },
      },
      exam.headers.etag,
    );
    assert.equal(proposal.statusCode, 201, proposal.body);
    const before = await f.academics.read(
      a.owner,
      async (ctx) =>
        (
          await ctx.db.execute(
            sql`select confirmed_at from app.manual_coverage where owner_id=${a.owner}`,
          )
        ).rows[0].confirmed_at,
    );
    f.now.setTime(f.now.getTime() + 61000);
    const copied = await r(
      a,
      "POST",
      url + "/copy",
      { confirmed: true, sourceWeekday: 1, targetWeekdays: [2], mode: "merge" },
      saved.headers.etag,
    );
    assert.equal(copied.statusCode, 200, copied.body);
    const after = await f.academics.read(
      a.owner,
      async (ctx) =>
        (
          await ctx.db.execute(
            sql`select confirmed_at from app.manual_coverage where owner_id=${a.owner}`,
          )
        ).rows[0].confirmed_at,
    );
    assert.equal(
      new Date(after as string).toISOString(),
      new Date(before as string).toISOString(),
    );
    const stale = await r(
      a,
      "POST",
      `/api/v1/plan-proposals/${proposal.json().id}/apply`,
      { confirmations: ["academic_date_change"] },
      proposal.headers.etag,
    );
    assert.equal(stale.statusCode, 412);
    assert.equal(
      (await r(a, "GET", `/api/v1/activities/${exam.json().id}`)).json()
        .dueDate,
      "2030-01-07",
    );
    const dst = {
      ...config,
      timezone: "America/New_York",
      exceptions: [
        {
          date: "2030-11-03",
          mode: "replace",
          intervals: [{ startMinute: 90, endMinute: 150 }],
        },
      ],
    };
    assert.equal(
      (await r(a, "PUT", url, dst, copied.headers.etag)).statusCode,
      200,
    );
    const uncertain = (
      await r(
        a,
        "GET",
        `/api/v1/periods/${id}/capacity?from=2030-11-03&to=2030-11-04`,
      )
    ).json();
    assert.equal(uncertain.availableMinutes, null);
    assert.ok(
      uncertain.issues.some(
        (x: { code: string }) => x.code === "DST_REVIEW_REQUIRED",
      ),
    );
  } finally {
    await f.close();
  }
});
