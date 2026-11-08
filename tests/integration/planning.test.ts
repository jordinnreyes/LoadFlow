import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { fixture } from "./fixture.js";
import { PlanningWorker } from "../../server/modules/jobs/planning-worker.js";

const api = "/api/v1";
const now = () => new Date("2030-01-01T13:00:00Z");
const config = () => ({
  confirmed: true,
  timezone: "America/Lima",
  validFrom: "2030-01-01",
  validTo: null,
  weekly: Array.from({ length: 7 }, (_, i) => ({
    weekday: i + 1,
    state: "windows",
    intervals: [{ startMinute: 540, endMinute: 780 }],
  })),
  exceptions: [],
  manualCoverage: [{ from: "2030-01-01", to: "2030-02-01" }],
  preferences: {
    minimumMinutes: 30,
    preferredMinutes: 60,
    maximumMinutes: 120,
  },
});
const etag = (r: { headers: Record<string, unknown> }) =>
  String(r.headers.etag);
const newActivity = (periodId: string, title: string) => ({
  periodId,
  title,
  type: "Tarea",
  dueDate: "2030-01-10",
  dueTime: "18:00",
  timezone: "America/Lima",
  allowedStartAt: "2030-01-01T13:00:00Z",
  operatingMinutes: 120,
  divisibility: "divisible",
});

test("F4 plans beyond five weeks, applies dates once, and revalidates automatic changes and undo", async () => {
  const f = await fixture(now());
  try {
    const a = await f.client(6 * 3600);
    const p = (
      await f.request(a, "POST", api + "/periods", {
        name: "Periodo largo",
        timezone: "America/Lima",
        endDate: "2030-02-18",
      })
    ).json();
    const period = api + "/periods/" + p.id;
    const capacity = {
      ...config(),
      manualCoverage: [{ from: "2030-01-01", to: "2030-03-01" }],
    };
    assert.equal(
      (
        await f.request(
          a,
          "PUT",
          period + "/availability",
          capacity,
          '"availability-0"',
        )
      ).statusCode,
      200,
    );
    const early = (
      await f.request(a, "POST", api + "/activities", {
        ...newActivity(p.id, "Trabajo adelantado"),
        dueDate: "2030-02-12",
      })
    ).json();
    const lateResponse = await f.request(a, "POST", api + "/activities", {
      ...newActivity(p.id, "Disponible en febrero"),
      dueDate: "2030-02-15",
      allowedStartAt: "2030-02-14T14:00:00Z",
    });
    assert.equal(lateResponse.statusCode, 201, lateResponse.body);
    const late = lateResponse.json();
    const current = () => f.request(a, "GET", period + "/plan");
    const preview = async (command: object) =>
      f.request(
        a,
        "POST",
        period + "/planning-proposals",
        command,
        etag(await current()),
      );
    const apply = (response: Awaited<ReturnType<typeof preview>>) =>
      f.request(
        a,
        "POST",
        api + "/planning-proposals/" + response.json().id + "/apply",
        { confirmations: response.json().requiredConfirmations },
        etag(response),
      );
    const first = await preview({ kind: "recalculate" });
    assert.equal(first.statusCode, 201, first.body);
    assert.ok(
      first
        .json()
        .after.sessions.some(
          (s: { activityId: string; startAt: string }) =>
            s.activityId === late.id && s.startAt.startsWith("2030-02-14"),
        ),
    );
    const active = await apply(first);
    assert.equal(active.statusCode, 200, active.body);
    const weekly = await f.request(
      a,
      "GET",
      period + "/weekly-plan?from=2030-01-01&to=2030-01-07",
    );
    assert.equal(weekly.statusCode, 200, weekly.body);
    assert.equal(weekly.json().weeks[0].deadlineActivityIds.length, 0);
    assert.equal(weekly.json().weeks[0].studyMinutes, 120);
    assert.equal(
      weekly
        .json()
        .weeks[0].days.reduce(
          (total: number, day: { studyMinutes: number }) =>
            total + day.studyMinutes,
          0,
        ),
      120,
    );
    assert.equal(weekly.json().weeks[0].state, "viable");

    const dateProposal = await f.request(
      a,
      "POST",
      api + "/activities/" + late.id + "/date-change-proposals",
      {
        dueDate: "2030-02-14",
        dueTime: "12:00",
        source: { kind: "manual" },
      },
      etag(lateResponse),
    );
    assert.equal(dateProposal.statusCode, 201, dateProposal.body);
    const change = await preview({
      kind: "academic_date",
      proposalId: dateProposal.json().id,
    });
    assert.equal(change.statusCode, 201, change.body);
    assert.ok(
      change.json().requiredConfirmations.includes("academic_date_change"),
    );
    const race = await Promise.all([apply(change), apply(change)]);
    assert.deepEqual(
      race.map((r) => r.statusCode).sort(),
      [200, 409],
      race.map((r) => r.body).join("\n"),
    );
    const revised = race.find((r) => r.statusCode === 200)!.json();
    const blocks = revised.result.sessions.filter(
      (s: { activityId: string; state: string }) =>
        s.activityId === early.id && s.state === "planned",
    );
    const firstBlock = blocks[0];
    const busy = await f.request(a, "POST", api + "/manual-commitments", {
      periodId: p.id,
      title: "Nuevo compromiso",
      confirmed: true,
      startAt: firstBlock.startAt,
      endAt: firstBlock.endAt,
      timezone: "America/Lima",
    });
    assert.equal(busy.statusCode, 201, busy.body);
    await new PlanningWorker(f.planning).tick();
    const replanned = (await current()).json();
    assert.equal(replanned.planRevision, revised.planRevision + 1);
    assert.equal(replanned.pendingProposalId, null);
    assert.ok(
      replanned.result.sessions.some(
        (s: { id: string; state: string }) =>
          s.id === firstBlock.id && s.state === "cancelled",
      ),
    );
    const conflict = await preview({ kind: "undo" });
    assert.equal(conflict.statusCode, 201, conflict.body);
    assert.equal((await apply(conflict)).statusCode, 422);
    const deleted = await f.request(
      a,
      "DELETE",
      api + "/manual-commitments/" + busy.json().id,
      undefined,
      etag(busy),
    );
    assert.equal(deleted.statusCode, 200, deleted.body);
    const undo = await preview({ kind: "undo" });
    assert.equal(undo.statusCode, 201, undo.body);
    const restored = await apply(undo);
    assert.equal(restored.statusCode, 200, restored.body);
    assert.ok(
      restored
        .json()
        .result.sessions.some(
          (s: { id: string; state: string }) =>
            s.id === firstBlock.id && s.state === "planned",
        ),
    );
    const dateHistory = await f.request(
      a,
      "GET",
      api + "/activities/" + late.id + "/date-history",
    );
    assert.equal(dateHistory.json().items.length, 1);
    assert.equal(dateHistory.json().items[0].after.dueDate, "2030-02-14");
    f.now.setUTCHours(17, 0, 0, 0);
    const elapsedPlan = await current();
    assert.equal(elapsedPlan.statusCode, 200, elapsedPlan.body);
    const elapsed = elapsedPlan
      .json()
      .result.sessions.find((s: { id: string }) => s.id === firstBlock.id);
    const completion = await preview({
      kind: "session_state",
      sessionId: elapsed.id,
      revision: elapsed.revision,
      state: "completed",
    });
    assert.equal(completion.statusCode, 201, completion.body);
    const completed = await apply(completion);
    assert.equal(completed.statusCode, 200, completed.body);
    assert.equal(
      completed
        .json()
        .result.sessions.find((s: { id: string }) => s.id === elapsed.id).state,
      "completed",
    );
    assert.equal(
      (
        await f.request(a, "GET", api + "/activities/" + early.id + "/progress")
      ).json().realTotalMinutes,
      null,
    );
  } finally {
    await f.close();
  }
});

test("F4 applies versioned private plans, verifies worker recovery, fixed conflicts and progress atomically", async () => {
  const time = now();
  const f = await fixture(time);
  try {
    const a = await f.client(),
      b = await f.client();
    const p = await f.request(a, "POST", api + "/periods", {
      name: "Plan sintético",
      timezone: "America/Lima",
      endDate: "2030-01-14",
    });
    assert.equal(p.statusCode, 201, p.body);
    const period = api + "/periods/" + p.json().id;
    const availability = await f.request(
      a,
      "PUT",
      period + "/availability",
      config(),
      '"availability-0"',
    );
    assert.equal(availability.statusCode, 200, availability.body);
    const made = await f.request(
      a,
      "POST",
      api + "/activities",
      newActivity(p.json().id, "Preparar actividad"),
    );
    assert.equal(made.statusCode, 201, made.body);
    const id = made.json().id;
    const start = await f.request(a, "GET", period + "/plan");
    assert.equal(start.json().state, "not_generated", start.body);
    const key = randomUUID();
    const preview = await f.request(
      a,
      "POST",
      period + "/planning-proposals",
      { kind: "recalculate" },
      etag(start),
      key,
    );
    assert.equal(preview.statusCode, 201, preview.body);
    const draft = preview.json();
    assert.equal(draft.after.state, "viable", preview.body);
    assert.equal(draft.after.sessions.length, 2);
    assert.equal(
      (await f.request(b, "GET", api + "/planning-proposals/" + draft.id))
        .statusCode,
      404,
    );
    assert.deepEqual(
      (
        await f.request(
          a,
          "POST",
          period + "/planning-proposals",
          { kind: "recalculate" },
          etag(start),
          key,
        )
      ).json(),
      draft,
    );
    assert.equal(
      (await f.request(a, "GET", period + "/plan")).json().state,
      "not_generated",
    );
    const applyKey = randomUUID();
    const apply = await f.request(
      a,
      "POST",
      api + "/planning-proposals/" + draft.id + "/apply",
      { confirmations: [] },
      etag(preview),
      applyKey,
    );
    assert.equal(apply.statusCode, 200, apply.body);
    assert.equal(apply.json().planRevision, 1);
    assert.equal(apply.json().result.balances[0].scheduled, 120);
    assert.deepEqual(
      (
        await f.request(
          a,
          "POST",
          api + "/planning-proposals/" + draft.id + "/apply",
          { confirmations: [] },
          etag(preview),
          applyKey,
        )
      ).json(),
      apply.json(),
    );
    const session = apply.json().result.sessions[0];
    const move = await f.request(
      a,
      "POST",
      period + "/planning-proposals",
      {
        kind: "move",
        sessionId: session.id,
        revision: session.revision,
        startAt: "2030-01-02T15:00:00Z",
        endAt: "2030-01-02T16:00:00Z",
      },
      etag(apply),
    );
    assert.equal(move.statusCode, 201, move.body);
    const moved = await f.request(
      a,
      "POST",
      api + "/planning-proposals/" + move.json().id + "/apply",
      { confirmations: [] },
      etag(move),
    );
    assert.equal(moved.statusCode, 200, moved.body);
    const fixed = moved
      .json()
      .result.sessions.find((s: { id: string }) => s.id === session.id);
    assert.equal(fixed.fixed, true);
    assert.equal(fixed.revision, session.revision + 1);

    const oldPreview = await f.request(
      a,
      "POST",
      period + "/planning-proposals",
      { kind: "recalculate" },
      etag(moved),
    );
    const commitment = await f.request(a, "POST", api + "/manual-commitments", {
      periodId: p.json().id,
      title: "Choque fijo",
      confirmed: true,
      startAt: fixed.startAt,
      endAt: fixed.endAt,
      timezone: "America/Lima",
    });
    assert.equal(commitment.statusCode, 201, commitment.body);
    const stale = await f.request(
      a,
      "POST",
      api + "/planning-proposals/" + oldPreview.json().id + "/apply",
      { confirmations: [] },
      etag(oldPreview),
    );
    assert.equal(stale.statusCode, 412, stale.body);
    const claimed = await f.ids.pool.query(
      "select * from app.claim_planning_job($1,$2,$3)",
      [time, randomUUID(), f.academics.planningQueue],
    );
    assert.equal(claimed.rows[0].period_id, p.json().id);
    time.setUTCSeconds(time.getUTCSeconds() + 61);
    const worker = new PlanningWorker(f.planning);
    await worker.tick();
    const conflicted = await f.request(a, "GET", period + "/plan");
    assert.equal(conflicted.json().state, "stale", conflicted.body);
    assert.equal(conflicted.json().planRevision, 2);
    assert.ok(conflicted.json().pendingProposalId);
    assert.ok(
      conflicted
        .json()
        .result.diagnostics.some(
          (d: { code: string }) => d.code === "SESSION_BUSY",
        ),
    );
    const undo = await f.request(
      a,
      "POST",
      period + "/planning-proposals",
      { kind: "undo" },
      etag(conflicted),
    );
    assert.equal(undo.statusCode, 201, undo.body);
    const rejected = await f.request(
      a,
      "POST",
      api + "/planning-proposals/" + undo.json().id + "/apply",
      { confirmations: undo.json().requiredConfirmations },
      etag(undo),
    );
    assert.equal(rejected.statusCode, 422, rejected.body);
    assert.equal(rejected.json().error.code, "UNDO_REVALIDATION_FAILED");
    const afterRejectedUndo = await f.request(a, "GET", period + "/plan");
    assert.equal(
      afterRejectedUndo.json().planRevision,
      conflicted.json().planRevision,
    );
    assert.deepEqual(
      afterRejectedUndo.json().result.sessions,
      conflicted.json().result.sessions,
    );

    const progress = await f.request(
      a,
      "PUT",
      api + "/activities/" + id + "/progress",
      { preparationState: "done", realTotalMinutes: 80 },
      etag(made),
    );
    assert.equal(progress.statusCode, 200, progress.body);
    assert.equal(progress.json().realTotalMinutes, 80);
    assert.equal(progress.json().fulfillmentState, "pending");
    const closed = (await f.request(a, "GET", period + "/plan")).json().result
      .sessions;
    assert.ok(
      closed.some(
        (s: { id: string; fixed: boolean; state: string }) =>
          s.id === session.id && s.fixed && s.state === "planned",
      ),
    );
    assert.ok(
      closed.some(
        (s: { fixed: boolean; state: string }) =>
          !s.fixed && s.state === "cancelled",
      ),
    );
    assert.equal(
      (await f.db.pool.query("select id from app.sessions")).rows.length,
      0,
    );
  } finally {
    await f.close();
  }
});

test("F7 plans in declared source zones across DST and only changes the weekly display zone", async () => {
  const time = new Date("2030-03-10T05:00:00Z");
  const f = await fixture(time);
  try {
    const a = await f.client();
    const created = await f.request(a, "POST", api + "/periods", {
      name: "Cambio de hora",
      timezone: "America/New_York",
      endDate: "2030-03-10",
    });
    assert.equal(created.statusCode, 201, created.body);
    const periodId = created.json().id;
    const period = api + "/periods/" + periodId;
    const available = await f.request(
      a,
      "PUT",
      period + "/availability",
      {
        ...config(),
        timezone: "America/New_York",
        validFrom: "2030-03-10",
        manualCoverage: [{ from: "2030-03-10", to: "2030-03-11" }],
        exceptions: [
          {
            date: "2030-03-10",
            mode: "replace",
            intervals: [{ startMinute: 90, endMinute: 240 }],
          },
        ],
      },
      '"availability-0"',
    );
    assert.equal(available.statusCode, 200, available.body);
    const input = {
      ...newActivity(periodId, "Bloque continuo durante el cambio de hora"),
      dueDate: "2030-03-10",
      dueTime: "17:00",
      timezone: "Asia/Tokyo",
      allowedStartAt: time.toISOString(),
      operatingMinutes: 90,
      divisibility: "indivisible",
    };
    const ambiguous = await f.request(a, "POST", api + "/activities", {
      ...input,
      timezone: "America/New_York",
      dueTime: "02:30",
    });
    assert.equal(ambiguous.statusCode, 422, ambiguous.body);
    const task = await f.request(a, "POST", api + "/activities", input);
    assert.equal(task.statusCode, 201, task.body);
    const current = await f.request(a, "GET", period + "/plan");
    const proposal = await f.request(
      a,
      "POST",
      period + "/planning-proposals",
      { kind: "recalculate" },
      etag(current),
    );
    assert.equal(proposal.statusCode, 201, proposal.body);
    assert.equal(proposal.json().after.state, "viable", proposal.body);
    const applied = await f.request(
      a,
      "POST",
      api + "/planning-proposals/" + proposal.json().id + "/apply",
      { confirmations: [] },
      etag(proposal),
    );
    assert.equal(applied.statusCode, 200, applied.body);
    const sessions = applied.json().result.sessions;
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].startAt, "2030-03-10T06:30:00.000Z");
    assert.equal(sessions[0].endAt, "2030-03-10T08:00:00.000Z");
    const weekly = () =>
      f.request(
        a,
        "GET",
        period + "/weekly-plan?from=2030-03-09&to=2030-03-11",
      );
    const east = await weekly();
    assert.equal(east.statusCode, 200, east.body);
    assert.equal(east.json().timezone, "America/New_York");
    assert.deepEqual(
      east
        .json()
        .weeks[0].days.map((d: { studyMinutes: number }) => d.studyMinutes),
      [0, 90],
    );
    const changed = await f.request(
      a,
      "PATCH",
      api + "/me/preferences",
      { studyTimezone: "America/Los_Angeles" },
      '"profile-1"',
    );
    assert.equal(changed.statusCode, 200, changed.body);
    const west = await weekly();
    assert.equal(west.statusCode, 200, west.body);
    assert.equal(west.json().timezone, "America/Los_Angeles");
    assert.deepEqual(
      west
        .json()
        .weeks[0].days.map((d: { studyMinutes: number }) => d.studyMinutes),
      [90, 0],
    );
    assert.equal(west.json().weeks[0].studyMinutes, 90);
    const persisted = await f.request(a, "GET", period + "/plan");
    assert.equal(persisted.json().planRevision, applied.json().planRevision);
    assert.deepEqual(persisted.json().result.sessions, sessions);
    const sources = await f.request(a, "GET", period + "/availability");
    assert.equal(sources.json().configuration.timezone, "America/New_York");
    const academic = await f.request(
      a,
      "GET",
      api + "/activities/" + task.json().id,
    );
    assert.equal(academic.json().timezone, "Asia/Tokyo");
    assert.equal(academic.json().dueTime, task.json().dueTime);
  } finally {
    await f.close();
  }
});

test("F4 keeps tentative groups and Calendar equivalences private and prevents reuse", async () => {
  const time = now(),
    f = await fixture(time);
  try {
    const a = await f.client();
    const p = (
      await f.request(a, "POST", api + "/periods", {
        name: "Grupos",
        timezone: "America/Lima",
        endDate: "2030-01-14",
      })
    ).json();
    const period = api + "/periods/" + p.id;
    await f.request(
      a,
      "PUT",
      period + "/availability",
      config(),
      '"availability-0"',
    );
    const data = {
      ...newActivity(p.id, "Trabajo en equipo"),
      type: "Entrega grupal",
      operatingMinutes: null,
    };
    const g = await f.request(a, "POST", api + "/activities", data);
    const g2 = await f.request(a, "POST", api + "/activities", {
      ...data,
      title: "Segundo equipo",
    });
    assert.equal(g.statusCode, 201, g.body);
    const group = api + "/activities/" + g.json().id;
    const initial = await f.request(a, "GET", period + "/plan");
    const preview = await f.request(
      a,
      "POST",
      period + "/planning-proposals",
      { kind: "recalculate", activityId: g.json().id },
      etag(initial),
    );
    assert.equal(preview.statusCode, 201, preview.body);
    assert.equal(preview.json().after.sessions.length, 3);
    assert.ok(
      preview
        .json()
        .after.sessions.every((s: { accepted: boolean }) => !s.accepted),
    );
    assert.ok(
      preview.json().requiredConfirmations.includes("group_reservations"),
    );
    const approved = await f.request(
      a,
      "POST",
      api + "/planning-proposals/" + preview.json().id + "/apply",
      { confirmations: preview.json().requiredConfirmations },
      etag(preview),
    );
    assert.equal(approved.statusCode, 200, approved.body);
    const accepted = await f.request(a, "GET", group + "/group-reservations");
    assert.equal(accepted.json().accepted, true);
    assert.equal(accepted.json().count, 3);

    // Controlled Calendar evidence in real PostgreSQL. No provider request or credential.
    const connection = randomUUID(),
      source = randomUUID(),
      snapshotId = randomUUID();
    const span = {
      startAt: "2030-01-03T14:00:00Z",
      endAt: "2030-01-03T15:00:00Z",
    };
    await f.academics.read(a.owner, async (ctx) => {
      await ctx.db
        .execute(sql`insert into app.calendar_connections(owner_id,id,state,revision,selection_revision,changed_at,last_success_at)
        values(${a.owner},${connection},'active',1,1,${time.toISOString()},${time.toISOString()})`);
      await ctx.db
        .execute(sql`insert into app.calendar_sources(id,owner_id,connection_id,provider_id,display_name,selected)
        values(${source},${a.owner},${connection},'synthetic','Synthetic',true)`);
      await ctx.db
        .execute(sql`insert into app.busy_snapshots(id,owner_id,calendar_id,connection_revision,selection_revision,range_start,range_end,fetched_at,content_hash)
        values(${snapshotId},${a.owner},${source},1,1,'2030-01-01T00:00:00Z','2030-01-15T05:00:00Z',${time.toISOString()},'synthetic')`);
      await ctx.db
        .execute(sql`insert into app.external_busy_intervals(id,owner_id,snapshot_id,start_at,end_at)
        values(${randomUUID()},${a.owner},${snapshotId},${span.startAt},${span.endAt})`);
    });
    const linked = await f.request(
      a,
      "POST",
      group + "/group-equivalences",
      { sourceId: source, ...span },
      etag(accepted),
    );
    assert.equal(linked.statusCode, 200, linked.body);
    assert.equal(linked.json().equivalences[0].valid, true);
    const duplicated = await f.request(
      a,
      "POST",
      api + "/activities/" + g2.json().id + "/group-equivalences",
      { sourceId: source, ...span },
      etag(g2),
    );
    assert.equal(duplicated.statusCode, 422, duplicated.body);
    assert.equal(
      duplicated.json().error.code,
      "GROUP_EQUIVALENCE_ALREADY_USED",
    );
    time.setUTCMinutes(time.getUTCMinutes() + 31);
    const outdated = await f.request(a, "GET", group + "/group-reservations");
    assert.equal(outdated.json().equivalences[0].valid, false);
  } finally {
    await f.close();
  }
});
