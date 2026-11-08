import { useEffect, useRef, useState } from "react";
import { segment } from "./academic";
import { endpoint, request, type Body, type Response } from "./client";
import { useRead } from "./useRead";
import type { useWrite } from "./useWrite";

export function useCalendarRefresh(
  run: ReturnType<typeof useWrite>["run"],
  onExpired: () => void,
  onComplete: () => void,
) {
  const [job, setJob] = useState<{
    id: string;
    kind: "discover" | "refresh";
  }>();
  const completed = useRef(onComplete);
  completed.current = onComplete;
  const read = useRead(
    job?.id ?? "",
    async (signal) =>
      job
        ? (
            await request<Response<"getOwnJob", 200>>(
              endpoint(`/jobs/${segment(job.id)}`),
              { signal },
            )
          ).data
        : null,
    onExpired,
  );
  const state = read.data?.status;
  useEffect(() => {
    if (!job || !state) return;
    if (state === "queued" || state === "running") {
      const timer = window.setTimeout(read.reload, 1800);
      return () => window.clearTimeout(timer);
    }
    completed.current();
  }, [job, read.data]);

  async function start(
    body: Body<"refreshCalendarBusy">,
    kind: "discover" | "refresh" = "refresh",
  ) {
    const result = await run<Response<"refreshCalendarBusy", 202>>({
      path: "/calendar/refresh",
      body,
    });
    if (result) {
      setJob({ id: result.job.id, kind });
      read.reload();
    }
  }
  return {
    start,
    job,
    read,
    state,
    inProgress:
      !!job &&
      !read.error &&
      (!state || state === "queued" || state === "running"),
  };
}
