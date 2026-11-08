import {
  allPages,
  endpoint,
  request,
  type Body,
  type Response,
} from "./client";

export type Period = Response<"listPeriods", 200>["items"][number];
export type Course = Response<"listCourses", 200>["items"][number];
export type Activity = Response<"getActivity", 200>;
export type WeeklyPlan = Response<"getWeeklyStudyPlan", 200>;
export type StudyPlan = Response<"getStudyPlan", 200>;
export type Proposal = Response<"previewStudyPlan", 201>;
export type Availability = Response<"getAvailability", 200>;
export type CalendarConnection = Response<"getCalendarConnection", 200>;
export type CalendarBusy = Response<"getCalendarBusy", 200>;
export type CalendarEvents = Response<"listCalendarEvents", 200>;
export type CalendarSource = Response<
  "listCalendarSources",
  200
>["items"][number];
export type Import = Response<"getImport", 200>;
export type Candidate = Response<"listImportCandidates", 200>["items"][number];

export const segment = (value: string) => encodeURIComponent(value);
export const periodPath = (id: string) => `/periods/${segment(id)}`;
export const activityPath = (id: string) => `/activities/${segment(id)}`;

export const academics = {
  courses: (periodId: string, signal?: AbortSignal) =>
    allPages<Course>(`${periodPath(periodId)}/courses`, {}, signal),
  activities: (periodId: string, signal?: AbortSignal) =>
    allPages<Activity>("/activities", { periodId }, signal),
  activity: (id: string, signal?: AbortSignal) =>
    request<Activity>(endpoint(activityPath(id)), { signal }),
  plan: (periodId: string, signal?: AbortSignal) =>
    request<StudyPlan>(endpoint(`${periodPath(periodId)}/plan`), { signal }),
  weekly: (periodId: string, from: string, to: string, signal?: AbortSignal) =>
    request<WeeklyPlan>(
      endpoint(`${periodPath(periodId)}/weekly-plan`, { from, to }),
      { signal },
    ),
  availability: (id: string, signal?: AbortSignal) =>
    request<Availability>(endpoint(`${periodPath(id)}/availability`), {
      signal,
    }),
  calendar: (signal?: AbortSignal) =>
    request<CalendarConnection>(endpoint("/calendar/connection"), { signal }),
  calendarBusy: (from: string, to: string, signal?: AbortSignal) =>
    request<CalendarBusy>(endpoint("/calendar/busy", { from, to }), { signal }),
  calendarEvents: (from: string, to: string, signal?: AbortSignal) =>
    request<CalendarEvents>(endpoint("/calendar/events", { from, to }), {
      signal,
    }),
};

export type CreateActivity = Body<"createActivity">;
export type UpdateActivity = Body<"updateActivity">;
export type Progress = Body<"reportProgress">;
export type PlanCommand = Body<"previewStudyPlan">;
