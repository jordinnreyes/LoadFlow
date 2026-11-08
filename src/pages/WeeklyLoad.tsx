import type { Workspace } from "../model";
import {
  addDays,
  dayNumber,
  duration,
  freeIntervals,
  occupations,
  weekMetrics,
} from "../rules";
import { LoadChart } from "../components/LoadChart";

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default function WeeklyLoad({
  workspace,
  start,
  index,
  status,
  onReview,
}: {
  workspace: Workspace;
  start: string;
  index: number;
  status: string;
  onReview: () => void;
}) {
  const m = weekMetrics(workspace, start);
  if (m.state === "empty") return null;
  const occupied = occupations(workspace);
  const deficits = m.issues.filter((issue) => issue.kind === "deficit");
  const hasCapacity = workspace.availabilityConfirmed;
  const days = DAYS.map((label, i) => {
    const date = addDays(start, i);
    const from = dayNumber(date);
    const capacity = freeIntervals(
      workspace,
      from,
      from + 1440,
      occupied,
    ).reduce((sum, slot) => sum + duration(slot), 0);
    const sessions = m.sessions.filter((s) => s.date === date);
    const study = sessions
      .filter((s) => !s.group)
      .reduce((sum, s) => sum + duration(s), 0);
    const group = sessions
      .filter((s) => s.group)
      .reduce((sum, s) => sum + duration(s), 0);
    const unplaced = deficits
      .filter((issue) =>
        m.deadlines.some((a) => a.id === issue.activityId && a.date === date),
      )
      .reduce((sum, issue) => sum + issue.minutes, 0);
    return {
      label,
      date,
      capacity,
      study,
      group,
      unplaced,
      total: study + group + unplaced,
    };
  });
  return (
    <LoadChart
      days={days}
      study={m.study}
      group={m.group}
      capacity={hasCapacity ? m.capacity : null}
      index={index}
      status={status}
      state={m.state}
      onReview={onReview}
    />
  );
}
