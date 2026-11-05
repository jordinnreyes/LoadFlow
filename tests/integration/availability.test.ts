import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "./fixture.js";
import type { AvailabilityConfig } from "../../packages/contracts/availability.js";
test("manual availability is private, versioned and explicit; capacity subtracts commitments once", async () => {
  const f = await fixture();
  try {
    const a = await f.client(),
      b = await f.client(),
      r = f.request;
    const id = (await r(a, "GET", "/api/v1/periods")).json().items[0].id;
    const url = `/api/v1/periods/${id}/availability`,
      capacity = `/api/v1/periods/${id}/capacity?from=2030-01-07&to=2030-01-08`;
    assert.equal((await r(b, "GET", url)).statusCode, 404);
    assert.equal((await r(a, "GET", capacity)).json().availableMinutes, null);
    const config: AvailabilityConfig = {
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
      manualCoverage: [],
      preferences: {
        minimumMinutes: 30,
        preferredMinutes: 60,
        maximumMinutes: 120,
      },
    };
    assert.equal((await r(a, "PUT", url, config)).statusCode, 428);
    const first = await r(a, "PUT", url, config, '"availability-0"');
    assert.equal(first.statusCode, 200, first.body);
    assert.equal((await r(a, "GET", capacity)).json().availableMinutes, null);
    config.manualCoverage = [{ from: "2030-01-07", to: "2030-01-08" }];
    const k = randomUUID();
    const saved = await r(a, "PUT", url, config, first.headers.etag, k);
    assert.equal(saved.statusCode, 200, saved.body);
    assert.equal(
      (await r(a, "PUT", url, config, first.headers.etag, k)).headers.etag,
      saved.headers.etag,
    );
    assert.equal(
      (
        await r(
          a,
          "PUT",
          url,
          { ...config, timezone: "UTC" },
          first.headers.etag,
          k,
        )
      ).statusCode,
      409,
    );
    assert.equal(
      (await r(a, "PUT", url, config, first.headers.etag)).statusCode,
      412,
    );
    assert.equal((await r(a, "GET", capacity)).json().availableMinutes, 180);
    const commitment = {
      periodId: id,
      title: "Clase ficticia",
      confirmed: true,
      timezone: "America/Lima",
      startAt: "2030-01-07T14:00:00Z",
      endAt: "2030-01-07T15:00:00Z",
    };
    const c1 = await r(a, "POST", "/api/v1/manual-commitments", commitment);
    assert.equal(c1.statusCode, 201, c1.body);
    const c2 = await r(a, "POST", "/api/v1/manual-commitments", {
      ...commitment,
      startAt: "2030-01-07T14:30:00Z",
      endAt: "2030-01-07T15:30:00Z",
    });
    assert.equal(c2.statusCode, 201, c2.body);
    assert.equal((await r(a, "GET", capacity)).json().availableMinutes, 90);
    assert.equal(
      (
        await r(
          b,
          "PATCH",
          `/api/v1/manual-commitments/${c1.json().id}`,
          { title: "Ajeno" },
          c1.headers.etag,
        )
      ).statusCode,
      404,
    );
    const patch = await r(
      a,
      "PATCH",
      `/api/v1/manual-commitments/${c1.json().id}`,
      { endAt: "2030-01-07T16:00:00Z" },
      c1.headers.etag,
    );
    assert.equal(patch.statusCode, 200, patch.body);
    assert.equal((await r(a, "GET", capacity)).json().availableMinutes, 60);
    assert.equal(
      (
        await r(
          a,
          "DELETE",
          `/api/v1/manual-commitments/${c1.json().id}`,
          undefined,
          c1.headers.etag,
        )
      ).statusCode,
      412,
    );
    assert.equal(
      (
        await r(
          a,
          "DELETE",
          `/api/v1/manual-commitments/${c1.json().id}`,
          undefined,
          patch.headers.etag,
        )
      ).statusCode,
      200,
    );
    const copy = await r(
      a,
      "POST",
      url + "/copy",
      {
        confirmed: true,
        sourceWeekday: 1,
        targetWeekdays: [2, 3],
        mode: "replace",
      },
      saved.headers.etag,
    );
    assert.equal(copy.statusCode, 200, copy.body);
    config.exceptions = [
      { date: "2030-01-07", mode: "no_study", intervals: [] },
    ];
    config.manualCoverage = [];
    const none = await r(a, "PUT", url, config, copy.headers.etag);
    assert.equal(none.statusCode, 200, none.body);
    const zero = (await r(a, "GET", capacity)).json();
    assert.equal(zero.certainty, "known");
    assert.equal(zero.availableMinutes, 0);
    assert.equal(zero.source, "manual");
    assert.equal(
      (
        await r(
          a,
          "GET",
          `/api/v1/periods/${id}/capacity?from=2030-01-01&to=2030-03-01`,
        )
      ).statusCode,
      422,
    );
    assert.equal(
      (
        await r(
          a,
          "PUT",
          url,
          { ...config, owner_id: b.owner },
          none.headers.etag,
        )
      ).statusCode,
      422,
    );
    const history = await f.academics.read(
      a.owner,
      async (ctx) =>
        (
          await ctx.db.execute(
            (await import("drizzle-orm"))
              .sql`select * from app.planning_input_changes where owner_id=${a.owner}`,
          )
        ).rows,
    );
    assert.equal(history.length, 8);
    assert.ok(
      history.every(
        (x) =>
          (x.summary as { sessionsChanged: boolean }).sessionsChanged === false,
      ),
    );
  } finally {
    await f.close();
  }
});
