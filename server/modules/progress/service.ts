import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  users,
  activities,
  progress,
  progressHistory,
} from "../../db/schema.js";
import type { Academics } from "../academics/service.js";
import {
  invalid,
  requireRevision,
  confirmReopening,
  completionDate,
} from "../academics/policy.js";
import type {
  ReportProgress,
  ActivityDto,
} from "../../../packages/contracts/academics.js";
export function reportProgress(
  service: Academics,
  owner: string,
  key: string | undefined,
  id: string,
  input: ReportProgress,
  version: string | undefined,
) {
  return service.mutate(
    owner,
    `progress:${id}`,
    key,
    { input, version },
    async (ctx) => {
      const a = await service.requireActivity(ctx, id);
      requireRevision(version, "activity", a.revision);
      const old = await service.activityDto(ctx, a);
      if (
        a.type === "Entrega grupal" &&
        ((input.realTotalMinutes !== undefined &&
          input.realTotalMinutes !== null) ||
          (input.remainingMinutes !== undefined &&
            input.remainingMinutes !== null))
      )
        throw invalid(
          "GROUP_NO_INDIVIDUAL_TIME",
          "Las reservas grupales no son dedicación individual medida.",
        );
      const prep = input.preparationState ?? a.preparationState;
      confirmReopening(
        a.preparationState,
        prep,
        input.reopenPreparation,
        input.remainingMinutes,
      );
      if (
        prep === "done" &&
        input.remainingMinutes !== undefined &&
        input.remainingMinutes !== null &&
        input.remainingMinutes > 0
      )
        throw invalid(
          "COMPLETION_WITH_REMAINING",
          "Confirma si terminaste o cuánto trabajo resta.",
        );
      const profile = (
        await ctx.db.select().from(users).where(eq(users.id, owner))
      )[0];
      const reopening = a.preparationState === "done" && prep !== "done";
      const closed =
        input.effectiveCompletionDate === undefined
          ? reopening
            ? null
            : old.effectiveCompletionDate
          : completionDate(
              input.effectiveCompletionDate,
              a.timezone ?? profile.studyTimezone,
              service.now(),
            );
      const real =
        input.realTotalMinutes === undefined
          ? old.realTotalMinutes
          : input.realTotalMinutes;
      const remaining =
        prep === "done"
          ? 0
          : input.remainingMinutes === undefined
            ? old.remainingMinutes
            : input.remainingMinutes;
      await ctx.db
        .update(progress)
        .set({
          realTotalMinutes: real,
          remainingMinutes: remaining,
          effectiveCompletionDate: closed,
          revision: sql`${progress.revision}+1`,
        })
        .where(eq(progress.activityId, id));
      const [next] = await ctx.db
        .update(activities)
        .set({
          preparationState: prep,
          fulfillmentState: input.fulfillmentState ?? a.fulfillmentState,
          revision: a.revision + 1,
          updatedAt: service.now().toISOString(),
        })
        .where(eq(activities.id, id))
        .returning();
      const dto = await service.activityDto(ctx, next);
      const snapshot = (d: ActivityDto) => ({
        realTotalMinutes: d.realTotalMinutes,
        remainingMinutes: d.remainingMinutes,
        preparationState: d.preparationState,
        fulfillmentState: d.fulfillmentState,
        effectiveCompletionDate: d.effectiveCompletionDate,
      });
      await ctx.db
        .insert(progressHistory)
        .values({
          id: randomUUID(),
          ownerId: owner,
          activityId: id,
          activityRevision: next.revision,
          before: snapshot(old),
          after: snapshot(dto),
          recordedAt: service.now().toISOString(),
        });
      await service.touch(ctx, a.periodId);
      return { status: 200, data: dto, etag: `"activity-${next.revision}"` };
    },
  );
}
