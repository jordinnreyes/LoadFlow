import type { operations } from "../../packages/contracts/client";

type Json<Response> = Response extends {
  content: { "application/json": infer Body };
}
  ? Body
  : never;
export type Response<
  Operation extends keyof operations,
  Status extends number,
> = Status extends keyof operations[Operation]["responses"]
  ? Json<operations[Operation]["responses"][Status]>
  : never;
export type Body<Operation extends keyof operations> = Json<
  operations[Operation]["requestBody"]
>;

export type Session = Response<"currentSession", 200>;
export type Capabilities = Response<"getCapabilities", 200>;
export type PeriodPage = Response<"listPeriods", 200>;
export type EmailChallenge = Response<"requestEmailCode", 202>;
type ApiProblem = Response<"currentSession", 401>["error"];

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem: ApiProblem,
  ) {
    super(problem.message);
    this.name = "ApiError";
  }

  get needsReview() {
    return this.status === 412 || this.status === 428;
  }
}

function unavailable(status: number, requestId = "") {
  return new ApiError(status, {
    code: "API_UNAVAILABLE",
    message:
      "No se pudo completar la conexión con WiseLoad. Intenta de nuevo.",
    fieldErrors: [],
    requestId,
    retryable: true,
  });
}

type RequestOptions = {
  body?: unknown;
  method?: "POST" | "PATCH" | "PUT" | "DELETE";
  csrfToken?: string;
  revision?: string | null;
  key?: string;
  signal?: AbortSignal;
};

export async function request<T>(path: string, options: RequestOptions = {}) {
  const headers = new Headers({ Accept: "application/json" });
  const form = options.body instanceof FormData ? options.body : null;
  if (options.body !== undefined && !form)
    headers.set("Content-Type", "application/json");
  if (options.csrfToken) headers.set("X-CSRF-Token", options.csrfToken);
  if (options.revision) headers.set("If-Match", options.revision);
  if (options.key) headers.set("Idempotency-Key", options.key);
  const response = await fetch(path, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    body:
      form ??
      (options.body === undefined ? undefined : JSON.stringify(options.body)),
    headers,
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal: options.signal,
  }).catch((error: unknown) => {
    if (options.signal?.aborted) throw error;
    throw unavailable(0);
  });
  let payload: unknown;
  if (response.status !== 204) {
    payload = await response.json().catch(() => undefined);
  }
  if (
    !response.ok ||
    (response.status !== 204 && (payload === undefined || payload === null))
  ) {
    if (payload && typeof payload === "object" && "error" in payload) {
      const problem = payload.error;
      if (
        problem &&
        typeof problem === "object" &&
        "message" in problem &&
        typeof problem.message === "string" &&
        "code" in problem &&
        typeof problem.code === "string"
      ) {
        throw new ApiError(response.status, problem as ApiProblem);
      }
    }
    throw unavailable(response.status);
  }
  return {
    data: payload as T,
    revision: response.headers.get("ETag"),
    serverTime: response.headers.get("Date"),
  };
}

export const endpoint = (path: string, query?: Record<string, string>) =>
  `/api/v1${path}${query ? `?${new URLSearchParams(query)}` : ""}`;

export async function allPages<T>(
  path: string,
  query: Record<string, string>,
  signal?: AbortSignal,
) {
  const items: T[] = [];
  let cursor: string | null = null;
  const seen = new Set<string>();
  do {
    const response: { data: { items: T[]; nextCursor: string | null } } =
      await request<{ items: T[]; nextCursor: string | null }>(
        endpoint(path, {
          ...query,
          limit: "100",
          ...(cursor ? { cursor } : {}),
        }),
        { signal },
      );
    items.push(...response.data.items);
    cursor = response.data.nextCursor;
    if (cursor && seen.has(cursor)) throw unavailable(502);
    if (cursor) seen.add(cursor);
  } while (cursor);
  return items;
}

export const api = {
  session: (signal?: AbortSignal) =>
    request<Session>("/api/v1/auth/session", { signal }),
  challenge: (body: Body<"requestEmailCode">) =>
    request<EmailChallenge>("/api/v1/auth/email/challenges", { body }),
  verify: (body: Body<"verifyEmailCode">) =>
    request<Session>("/api/v1/auth/email/verify", { body }),
  logout: (csrfToken: string) =>
    request<void>("/api/v1/auth/logout", { body: {}, csrfToken }),
  capabilities: (signal?: AbortSignal) =>
    request<Capabilities>("/api/v1/me/capabilities", { signal }),
  periods: (signal?: AbortSignal) =>
    request<PeriodPage>("/api/v1/periods", { signal }),
};

export function apiMessage(error: unknown) {
  return error instanceof ApiError ? error.message : unavailable(0).message;
}
