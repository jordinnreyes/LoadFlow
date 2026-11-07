import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import {
  Estimates,
  type EstimatePolicy,
} from "../../server/modules/estimates/service.js";
import { runPremiumCommand } from "../../server/modules/entitlements/operator.js";
import { consentVersion } from "../../server/modules/entitlements/service.js";
import type { ProviderResult } from "../../server/modules/estimates/provider.js";
import { estimateCorpus } from "../fixtures/estimates/corpus.js";
import { fixture } from "./fixture.js";

const consentPath = "/api/v1/me/estimate-consent";
const excerpt: string = estimateCorpus[0].excerpt;
const success: ProviderResult = {
  kind: "settled",
  requestId: "fixture",
  usage: { input: 25, output: 10 },
  output: {
    status: "estimated",
    lowMinutes: 40,
    highMinutes: 80,
    factors: [{ kind: "deliverables", evidence: "un archivo SQL" }],
    missingContext: [],
  },
};
const policy: EstimatePolicy = {
  environment: "development",
  model: "fixture-model",
  tariffVersion: "fixture-v1",
  fingerprintKey: randomBytes(32),
  maxInputTokens: 100,
  maxOutputTokens: 20,
  maxMinutes: 120,
  timeoutMs: 5000,
  concurrency: 2,
  inputMicrosPerMillion: 1000000n,
  outputMicrosPerMillion: 2000000n,
  userBudgetMicros: 140n,
  globalBudgetMicros: 140n,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("Premium is operator-controlled and concurrent requests cannot overspend or duplicate a reservation", async () => {
  const entered = deferred<void>();
  const complete = deferred<ProviderResult>();
  let calls = 0;
  const f = await fixture(
    undefined,
    undefined,
    undefined,
    (academics) =>
      new Estimates(
        academics,
        {
          estimate: async () => {
            calls++;
            entered.resolve();
            return complete.promise;
          },
        },
        policy,
      ),
  );
  const operator = new pg.Client({
    connectionString: process.env.MIGRATION_DATABASE_URL,
  });
  const owners: string[] = [];
  try {
    await operator.connect();
    const a = await f.client();
    const b = await f.client();
    owners.push(a.owner, b.owner);
    async function activity(user: typeof a) {
      const period = await f.request(user, "POST", "/api/v1/periods", {
        name: "F5 sintético",
      });
      assert.equal(period.statusCode, 201, period.body);
      const result = await f.request(user, "POST", "/api/v1/activities", {
        periodId: period.json().id,
        title: "Laboratorio sintético",
        type: "Tarea",
        dueDate: "2030-01-15",
      });
      assert.equal(result.statusCode, 201, result.body);
      return "/api/v1/activities/" + result.json().id;
    }
    const aPath = await activity(a),
      bPath = await activity(b);
    const make = (user: typeof a, path: string, key = randomUUID()) =>
      f.request(
        user,
        "POST",
        path + "/estimates",
        { excerpt },
        '"activity-1"',
        key,
      );
    assert.equal((await make(a, aPath)).json().error.code, "PREMIUM_REQUIRED");
    await assert.rejects(
      f.db.pool.query("insert into app.premium_grants(owner_id) values($1)", [
        a.owner,
      ]),
      { code: "42501" },
    );
    for (const user of [a, b]) {
      await runPremiumCommand(
        operator,
        {
          action: "grant",
          owner: user.owner,
          expiresAt: new Date("2030-01-02T00:00:00Z"),
          actor: "fixture",
          reason: "F5",
        },
        f.now,
      );
      const denied = await make(user, user === a ? aPath : bPath);
      assert.equal(denied.json().error.code, "ESTIMATE_CONSENT_REQUIRED");
      const consent = await f.request(
        user,
        "PUT",
        consentPath,
        { policyVersion: consentVersion, granted: true },
        '"consent-0"',
      );
      assert.equal(consent.statusCode, 200, consent.body);
    }
    assert.equal(
      (await f.request(a, "GET", "/api/v1/me/capabilities")).json().plan,
      "Premium",
    );
    assert.equal((await make(b, aPath)).statusCode, 404);
    const key = randomUUID();
    const first = make(a, aPath, key);
    await Promise.race([
      entered.promise,
      first.then((r) => {
        assert.fail(r.body);
      }),
    ]);
    const duplicate = await make(a, aPath, key);
    assert.equal(duplicate.statusCode, 202, duplicate.body);
    assert.equal(duplicate.json().state, "pending");
    const secondKey = await make(a, aPath);
    assert.equal(secondKey.json().id, duplicate.json().id);
    const exceeded = await make(b, bPath);
    assert.equal(exceeded.statusCode, 429, exceeded.body);
    assert.equal(exceeded.json().error.code, "ESTIMATE_BUDGET_LIMIT");
    complete.resolve(success);
    const result = await first;
    assert.equal(result.statusCode, 202, result.body);
    assert.equal(result.json().state, "complete");
    assert.equal(calls, 1);
    assert.equal((await make(a, aPath)).json().id, result.json().id);
    assert.equal(
      (await f.request(b, "GET", result.headers.location as string)).statusCode,
      404,
    );
    const ledger = await operator.query(
      "select actual_micros,reserved_micros,input_tokens,output_tokens,result from app.estimate_usage where id=$1",
      [result.json().id],
    );
    assert.deepEqual(ledger.rows[0], {
      actual_micros: "45",
      reserved_micros: "140",
      input_tokens: 25,
      output_tokens: 10,
      result: result.json().suggestion,
    });
    assert.equal(
      (await f.request(a, "GET", aPath)).json().operatingMinutes,
      null,
    );
    await runPremiumCommand(
      operator,
      {
        action: "revoke",
        owner: a.owner,
        actor: "fixture",
        reason: "Fin de prueba",
      },
      f.now,
    );
    const downgraded = (
      await f.request(a, "GET", "/api/v1/me/capabilities")
    ).json();
    assert.equal(downgraded.plan, "Free");
    assert.equal(downgraded.manualEstimates, true);
    assert.equal(
      (await f.request(a, "GET", result.headers.location as string)).statusCode,
      403,
    );
  } finally {
    complete.resolve(success);
    if (owners.length)
      await operator.query(
        "delete from app.estimate_usage where owner_id=any($1::uuid[])",
        [owners],
      );
    await operator.end();
    await f.close();
  }
});

test("uncertain calls retain budget and require explicit reconciliation before another attempt", async () => {
  let calls = 0;
  const f = await fixture(
    undefined,
    undefined,
    undefined,
    (academics) =>
      new Estimates(
        academics,
        {
          estimate: async () => {
            calls++;
            if (calls === 1) return new Promise<ProviderResult>(() => {});
            return success;
          },
        },
        { ...policy, timeoutMs: 40 },
      ),
  );
  const operator = new pg.Client({
    connectionString: process.env.MIGRATION_DATABASE_URL,
  });
  let owner: string | undefined;
  try {
    await operator.connect();
    const a = await f.client();
    owner = a.owner;
    await runPremiumCommand(
      operator,
      {
        action: "grant",
        owner,
        expiresAt: new Date("2030-01-02T00:00:00Z"),
        actor: "fixture",
        reason: "F5",
      },
      f.now,
    );
    const consent = await f.request(
      a,
      "PUT",
      consentPath,
      { policyVersion: consentVersion, granted: true },
      '"consent-0"',
    );
    assert.equal(consent.statusCode, 200, consent.body);
    const p = await f.request(a, "POST", "/api/v1/periods", {
      name: "F5 sintético",
    });
    const activity = await f.request(a, "POST", "/api/v1/activities", {
      periodId: p.json().id,
      title: "Tarea sintética",
      type: "Tarea",
      dueDate: "2030-01-10",
    });
    assert.equal(activity.statusCode, 201, activity.body);
    const path = "/api/v1/activities/" + activity.json().id + "/estimates";
    const make = (input = excerpt) =>
      f.request(a, "POST", path, { excerpt: input }, '"activity-1"');
    const first = await make();
    assert.equal(first.statusCode, 202, first.body);
    assert.equal(first.json().state, "outcome_unknown");
    assert.equal((await make()).json().id, first.json().id);
    assert.equal(
      (await make(estimateCorpus[1].excerpt)).json().error.code,
      "ESTIMATE_BUDGET_LIMIT",
    );
    assert.equal(calls, 1);
    await runPremiumCommand(
      operator,
      {
        action: "reconcile",
        estimateId: first.json().id,
        micros: "0",
        actor: "fixture",
        reason: "Doble sin consumo",
      },
      f.now,
    );
    const retry = await make();
    assert.equal(retry.json().state, "complete");
    assert.equal(calls, 2);
    const revoked = await f.request(
      a,
      "PUT",
      consentPath,
      { policyVersion: consentVersion, granted: false },
      '"consent-1"',
    );
    assert.equal(revoked.statusCode, 200, revoked.body);
    assert.equal((await make()).json().error.code, "ESTIMATE_CONSENT_REQUIRED");
    assert.equal(
      (await f.request(a, "GET", retry.headers.location as string)).statusCode,
      403,
    );
  } finally {
    if (owner)
      await operator.query("delete from app.estimate_usage where owner_id=$1", [
        owner,
      ]);
    await operator.end();
    await f.close();
  }
});
