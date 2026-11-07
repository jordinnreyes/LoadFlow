import {
  pgSchema,
  uuid,
  text,
  integer,
  boolean,
  date,
  time,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
const app = pgSchema("app");
const instant = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "string" });
export const users = app.table("users", {
  id: uuid("id").primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  displayName: text("display_name").notNull(),
  studyTimezone: text("study_timezone"),
  onboardingState: text("onboarding_state").notNull(),
  revision: integer("revision").notNull(),
  createdAt: instant("created_at").notNull(),
  updatedAt: instant("updated_at").notNull(),
});
export const periods = app.table("academic_periods", {
  id: uuid("id").primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  name: text("name").notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  timezone: text("timezone"),
  isDefault: boolean("is_default").notNull(),
  workspaceRevision: integer("workspace_revision").notNull(),
  planRevision: integer("plan_revision").default(0).notNull(),
  revision: integer("revision").notNull(),
  createdAt: instant("created_at").notNull(),
  updatedAt: instant("updated_at").notNull(),
});
export const courses = app.table("courses", {
  id: uuid("id").primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  periodId: uuid("period_id").notNull(),
  name: text("name").notNull(),
  revision: integer("revision").notNull(),
  createdAt: instant("created_at").notNull(),
  updatedAt: instant("updated_at").notNull(),
});
export const activities = app.table("activities", {
  id: uuid("id").primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  periodId: uuid("period_id").notNull(),
  courseId: uuid("course_id"),
  title: text("title").notNull(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  dueDate: date("due_date").notNull(),
  dueTime: time("due_time"),
  timezone: text("academic_timezone"),
  dueAt: instant("due_at"),
  allowedStartAt: instant("allowed_start_at"),
  divisibility: text("divisibility").notNull(),
  priorityMode: text("priority_mode").notNull(),
  priorityOverride: text("priority_override"),
  preparationState: text("preparation_state").notNull(),
  fulfillmentState: text("fulfillment_state").notNull(),
  operatingMinutes: integer("operating_minutes"),
  revision: integer("revision").notNull(),
  confirmedAt: instant("confirmed_at").notNull(),
  createdAt: instant("created_at").notNull(),
  updatedAt: instant("updated_at").notNull(),
});
export const priorityRules = app.table("priority_rules", {
  ownerId: uuid("owner_id").notNull(),
  courseId: uuid("course_id").notNull(),
  activityType: text("activity_type").notNull(),
  priority: text("priority").notNull(),
});
export const progress = app.table("progress_current", {
  activityId: uuid("activity_id").primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  realTotalMinutes: integer("real_total_minutes"),
  remainingMinutes: integer("remaining_minutes"),
  effectiveCompletionDate: date("effective_completion_date"),
  revision: integer("revision").notNull(),
});
export const effortHistory = app.table("effort_confirmations", {
  id: uuid("id").primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  activityId: uuid("activity_id").notNull(),
  activityRevision: integer("activity_revision").notNull(),
  minutes: integer("minutes"),
  origin: text("origin").notNull(),
  supersedesId: uuid("supersedes_id"),
  confirmedAt: instant("confirmed_at").notNull(),
});
export const progressHistory = app.table("progress_revisions", {
  id: uuid("id").primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  activityId: uuid("activity_id").notNull(),
  activityRevision: integer("activity_revision").notNull(),
  before: jsonb("before_value").notNull(),
  after: jsonb("after_value").notNull(),
  recordedAt: instant("recorded_at").notNull(),
});
