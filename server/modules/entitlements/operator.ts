import { randomUUID } from "node:crypto";
import type { Client } from "pg";

type Operator = { actor: string; reason: string };
export type PremiumCommand = Operator &
  (
    | { action: "grant"; owner: string; expiresAt: Date }
    | { action: "revoke"; owner: string }
    | { action: "reconcile"; estimateId: string; micros: string }
  );

export async function runPremiumCommand(
  client: Client,
  command: PremiumCommand,
  now = new Date(),
) {
  if (
    !command.actor.trim() ||
    command.actor.length > 100 ||
    !command.reason.trim() ||
    command.reason.length > 240
  )
    throw new Error("Indica operador y motivo.");
  await client.query("begin");
  try {
    if (command.action === "reconcile") {
      if (!/^\d{1,15}$/.test(command.micros))
        throw new Error("Importe en microdólares inválido.");
      const found = await client.query<{ owner_id: string }>(
        "select owner_id from app.estimate_usage where id=$1",
        [command.estimateId],
      );
      if (!found.rows[0]) throw new Error("Estimación inexistente.");
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1,0))",
        [found.rows[0].owner_id],
      );
      await client.query("select pg_advisory_xact_lock(204819,2)");
      const update = await client.query(
        `update app.estimate_usage set state='failed',actual_micros=$2,finished_at=$3,
          error_code=case when $2::bigint>reserved_micros then 'PROVIDER_USAGE_EXCEEDED' else 'ESTIMATE_RECONCILED' end,
          reconciled_at=$3,reconciled_by=$4,reconciliation_reason=$5
          where id=$1 and (state='outcome_unknown' or (state='running' and expires_at<=$3))`,
        [
          command.estimateId,
          command.micros,
          now,
          command.actor,
          command.reason,
        ],
      );
      if (update.rowCount !== 1)
        throw new Error("La estimación no está pendiente de conciliación.");
    } else {
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1,0))",
        [command.owner],
      );
      if (command.action === "grant") {
        if (
          !Number.isFinite(command.expiresAt.getTime()) ||
          command.expiresAt <= now
        )
          throw new Error("Indica un vencimiento futuro.");
        await client.query(
          `update app.premium_grants set revoked_at=$2,revoked_by=$3,revocation_reason='Vencimiento anterior'
            where owner_id=$1 and revoked_at is null and expires_at<=$2`,
          [command.owner, now, command.actor],
        );
        await client.query(
          `insert into app.premium_grants(id,owner_id,actor,reason,granted_at,expires_at)
            values($1,$2,$3,$4,$5,$6)`,
          [
            randomUUID(),
            command.owner,
            command.actor,
            command.reason,
            now,
            command.expiresAt,
          ],
        );
      } else {
        const update = await client.query(
          `update app.premium_grants set revoked_at=$2,revoked_by=$3,revocation_reason=$4
            where owner_id=$1 and revoked_at is null`,
          [command.owner, now, command.actor, command.reason],
        );
        if (update.rowCount !== 1)
          throw new Error("No hay concesión por revocar.");
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
