import { createHash } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import type { EventsDto } from "../../../packages/contracts/calendar.js";
export const SCOPES = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.freebusy",
] as const;
export const EVENT_TITLES_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.readonly";
export const CALENDAR_POLICY = {
  chunkDays: 31,
  foregroundRefreshSeconds: 900,
  staleAfterSeconds: 1800,
  cooldownSeconds: 60,
  manualCooldownSeconds: 3,
  maxAttempts: 3,
} as const;
export type Token = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
};
export type CalendarInfo = {
  providerId: string;
  name: string;
  timezone: string | null;
  primary: boolean;
};
export type BusyResult = {
  providerId: string;
  busy: { startAt: string; endAt: string }[];
  error?: string;
};
type EventBoundary = { date?: string; dateTime?: string; timeZone?: string };

function eventInstant(
  value: EventBoundary | undefined,
  calendarZone: string | null,
) {
  const zone = value?.timeZone ?? calendarZone;
  if (value?.date && zone)
    return Temporal.PlainDate.from(value.date)
      .toZonedDateTime(zone)
      .toInstant();
  const dateTime = value?.dateTime ?? "";
  try {
    return Temporal.Instant.from(dateTime);
  } catch (error) {
    if (!zone) throw error;
    return Temporal.PlainDateTime.from(dateTime)
      .toZonedDateTime(zone)
      .toInstant();
  }
}
export class CalendarFailure extends Error {
  constructor(
    readonly code: string,
    readonly retryable = false,
    readonly retryAfterSeconds = 0,
    readonly revoked = false,
  ) {
    super(code);
  }
}
export interface CalendarProvider {
  authorization(state: string, verifier: string): string;
  exchange(code: string, verifier: string): Promise<Token>;
  refresh(token: Token): Promise<Token>;
  revoke(token: Token): Promise<void>;
  calendars(token: Token): Promise<CalendarInfo[]>;
  events(
    token: Token,
    source: { providerId: string; timezone: string | null },
    from: string,
    to: string,
    signal: AbortSignal,
  ): Promise<EventsDto>;
  busy(
    token: Token,
    ids: string[],
    from: string,
    to: string,
  ): Promise<BusyResult[]>;
}
export const challenge = (verifier: string) =>
  createHash("sha256").update(verifier).digest("base64url");
export function granted(scopes: string[]) {
  return (
    SCOPES.every((s) => scopes.includes(s)) &&
    scopes.every(
      (s) =>
        SCOPES.includes(s as (typeof SCOPES)[number]) ||
        s === EVENT_TITLES_SCOPE ||
        [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile",
        ].includes(s),
    )
  );
}
export function retryAfter(value: string | null, now = Date.now()) {
  if (!value) return 0;
  const seconds = Number(value);
  return Number.isFinite(seconds)
    ? Math.max(0, seconds)
    : Math.max(0, Math.ceil((Date.parse(value) - now) / 1000)) || 0;
}
export class GoogleCalendarProvider implements CalendarProvider {
  constructor(
    readonly config: {
      clientId: string;
      clientSecret: string;
      callback: string;
    },
    readonly request: typeof fetch = fetch,
    readonly now = () => new Date(),
  ) {}
  authorization(state: string, verifier: string) {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.callback,
      response_type: "code",
      scope: [...SCOPES, EVENT_TITLES_SCOPE].join(" "),
      state,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "false",
      code_challenge: challenge(verifier),
      code_challenge_method: "S256",
    }).toString();
    return url.toString();
  }
  private async json(url: string, init: RequestInit) {
    let response: Response;
    try {
      response = await this.request(url, {
        ...init,
        redirect: "error",
        signal: init.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
          : AbortSignal.timeout(15000),
      });
    } catch {
      throw new CalendarFailure("CALENDAR_UNREACHABLE", true);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      const error = (body && typeof body === "object" ? body : {}) as {
        error?: string | { status?: string; errors?: { reason?: string }[] };
      };
      if (error.error === "invalid_grant")
        throw new CalendarFailure("CALENDAR_REVOKED", false, 0, true);
      const transient =
        response.status === 429 ||
        response.status >= 500 ||
        (response.status === 403 &&
          error.error !== null &&
          typeof error.error === "object" &&
          error.error.errors?.some((x) =>
            [
              "rateLimitExceeded",
              "userRateLimitExceeded",
              "quotaExceeded",
            ].includes(x.reason ?? ""),
          ));
      throw new CalendarFailure(
        response.status === 401
          ? "CALENDAR_UNAUTHORIZED"
          : response.status === 403
            ? "CALENDAR_FORBIDDEN"
            : response.status === 429
              ? "CALENDAR_RATE_LIMITED"
              : "CALENDAR_PROVIDER_ERROR",
        !!transient,
        retryAfter(response.headers.get("retry-after"), this.now().getTime()),
      );
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new CalendarFailure(
        "CALENDAR_INVALID_RESPONSE",
        true,
        retryAfter(response.headers.get("retry-after"), this.now().getTime()),
      );
    return body as Record<string, unknown>;
  }
  private async token(form: Record<string, string>, old?: Token) {
    const b = await this.json("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        ...form,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    });
    if (
      typeof b.access_token !== "string" ||
      !b.access_token ||
      typeof b.expires_in !== "number" ||
      b.expires_in <= 0 ||
      !Number.isFinite(this.now().getTime() + b.expires_in * 1000) ||
      typeof (b.refresh_token ?? old?.refreshToken) !== "string" ||
      !(b.refresh_token ?? old?.refreshToken)
    )
      throw new CalendarFailure("CALENDAR_INVALID_TOKEN");
    const scopes =
      typeof b.scope === "string"
        ? b.scope.split(" ").filter(Boolean)
        : (old?.scopes ?? []);
    if (!granted(scopes)) throw new CalendarFailure("CALENDAR_SCOPES_REQUIRED");
    return {
      accessToken: b.access_token,
      refreshToken: (b.refresh_token ?? old!.refreshToken) as string,
      expiresAt: this.now().getTime() + b.expires_in * 1000,
      scopes,
    };
  }
  exchange(code: string, verifier: string) {
    return this.token({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: this.config.callback,
    });
  }
  refresh(old: Token) {
    return this.token(
      { grant_type: "refresh_token", refresh_token: old.refreshToken },
      old,
    );
  }
  async revoke(token: Token) {
    let response: Response;
    try {
      response = await this.request("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: token.refreshToken }),
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
    } catch {
      throw new CalendarFailure("CALENDAR_REVOCATION_UNCONFIRMED", true);
    }
    if (!response.ok)
      throw new CalendarFailure(
        "CALENDAR_REVOCATION_UNCONFIRMED",
        response.status >= 500 || response.status === 429,
      );
  }
  async calendars(token: Token) {
    const result: CalendarInfo[] = [],
      seen = new Set<string>();
    let page: string | undefined;
    do {
      const u = new URL(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      );
      u.search = new URLSearchParams({
        fields:
          "items(id,summary,timeZone,primary,accessRole,deleted),nextPageToken",
        maxResults: "250",
        ...(page ? { pageToken: page } : {}),
      }).toString();
      const b = await this.json(u.toString(), {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      if (!Array.isArray(b.items))
        throw new CalendarFailure("CALENDAR_INVALID_RESPONSE", true);
      for (const row of b.items) {
        const r = row as Record<string, unknown>;
        if (r.deleted === true || r.accessRole === "none") continue;
        if (
          typeof r.id !== "string" ||
          typeof r.summary !== "string" ||
          (r.timeZone !== undefined && typeof r.timeZone !== "string")
        )
          throw new CalendarFailure("CALENDAR_INVALID_RESPONSE", true);
        result.push({
          providerId: r.id,
          name: r.summary.slice(0, 300),
          timezone: typeof r.timeZone === "string" ? r.timeZone : null,
          primary: r.primary === true,
        });
      }
      if (b.nextPageToken !== undefined && typeof b.nextPageToken !== "string")
        throw new CalendarFailure("CALENDAR_INVALID_RESPONSE", true);
      page = b.nextPageToken as string | undefined;
      if (page) {
        if (seen.has(page))
          throw new CalendarFailure("CALENDAR_INVALID_RESPONSE", true);
        seen.add(page);
      }
    } while (page);
    return result;
  }
  async busy(token: Token, ids: string[], from: string, to: string) {
    const result: BusyResult[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      const b = await this.json(
        "https://www.googleapis.com/calendar/v3/freeBusy",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            timeMin: from,
            timeMax: to,
            timeZone: "UTC",
            calendarExpansionMax: 50,
            items: batch.map((id) => ({ id })),
          }),
        },
      );
      if (!b.calendars || typeof b.calendars !== "object")
        throw new CalendarFailure("CALENDAR_INVALID_RESPONSE", true);
      for (const id of batch) {
        const r = (
          b.calendars as Record<
            string,
            { busy?: unknown; errors?: { reason?: string }[] }
          >
        )[id];
        if (!r || r.errors?.length) {
          result.push({
            providerId: id,
            busy: [],
            error: r?.errors?.every((e) => e.reason === "internalError")
              ? "CALENDAR_TRANSIENT_PARTIAL"
              : "CALENDAR_SOURCE_UNAVAILABLE",
          });
          continue;
        }
        if (!Array.isArray(r.busy))
          throw new CalendarFailure("CALENDAR_INVALID_RESPONSE", true);
        const intervals = r.busy.map((x) => {
          const v = x as { start?: string; end?: string };
          const start = Date.parse(v.start ?? ""),
            end = Date.parse(v.end ?? "");
          if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
            throw new CalendarFailure("CALENDAR_INVALID_RESPONSE", true);
          return {
            startAt: new Date(start).toISOString(),
            endAt: new Date(end).toISOString(),
          };
        });
        result.push({ providerId: id, busy: intervals });
      }
    }
    return result;
  }
  async events(
    token: Token,
    source: { providerId: string; timezone: string | null },
    from: string,
    to: string,
    signal: AbortSignal,
  ): Promise<EventsDto> {
    const items: EventsDto["items"] = [];
    const seen = new Set<string>();
    const fromMs = Date.parse(from),
      toMs = Date.parse(to);
    let page: string | undefined;
    for (let index = 0; index < 4; index++) {
      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.providerId)}/events`,
      );
      url.search = new URLSearchParams({
        timeMin: from,
        timeMax: to,
        singleEvents: "true",
        showDeleted: "false",
        maxResults: "250",
        fields:
          "timeZone,nextPageToken,items(summary,start(date,dateTime,timeZone),end(date,dateTime,timeZone),status,transparency)",
        ...(page ? { pageToken: page } : {}),
      }).toString();
      const body = await this.json(url.toString(), {
        headers: { Authorization: `Bearer ${token.accessToken}` },
        signal,
      });
      if (
        !Array.isArray(body.items) ||
        (body.nextPageToken !== undefined &&
          typeof body.nextPageToken !== "string")
      )
        throw new CalendarFailure("CALENDAR_INVALID_RESPONSE", true);
      const zone =
        typeof body.timeZone === "string" ? body.timeZone : source.timezone;
      for (const value of body.items) {
        if (!value || typeof value !== "object") continue;
        const row = value as {
          summary?: unknown;
          status?: string;
          transparency?: string;
          start?: EventBoundary;
          end?: EventBoundary;
        };
        const title =
          typeof row.summary === "string"
            ? row.summary.trim().slice(0, 300)
            : "";
        if (!title || row.status === "cancelled") continue;
        const allDay = !!row.start?.date && !!row.end?.date;
        try {
          const start = eventInstant(row.start, zone),
            end = eventInstant(row.end, zone);
          if (
            Temporal.Instant.compare(start, end) >= 0 ||
            end.epochMilliseconds <= fromMs ||
            start.epochMilliseconds >= toMs
          )
            continue;
          items.push({
            title,
            startAt: start.toString(),
            endAt: end.toString(),
            allDay,
            blocksTime: row.transparency !== "transparent",
          });
        } catch {
          continue;
        }
      }
      page = body.nextPageToken as string | undefined;
      if (!page) return { items, partial: false };
      if (seen.has(page)) break;
      seen.add(page);
    }
    return { items, partial: true };
  }
}
