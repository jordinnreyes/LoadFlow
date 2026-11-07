import {
  instructions,
  ProviderSuggestion,
  type EstimateContext,
} from "./prompt.js";

export type Usage = { input: number; output: number };
export type ProviderResult =
  | { kind: "unknown"; requestId: string | null }
  | {
      kind: "settled";
      requestId: string | null;
      usage: Usage;
      output?: unknown;
      errorCode?: string;
    };
export interface EstimateProvider {
  estimate(
    context: EstimateContext,
    request: { model: string; maxOutputTokens: number; signal: AbortSignal },
  ): Promise<ProviderResult>;
}

function tokenCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 2147483647
  );
}
export function validUsage(value: Usage | undefined): value is Usage {
  return !!value && tokenCount(value.input) && tokenCount(value.output);
}

export class OpenAIResponses implements EstimateProvider {
  constructor(
    private readonly key: string,
    private readonly transport = fetch,
  ) {}

  async estimate(
    context: EstimateContext,
    {
      model,
      maxOutputTokens,
      signal,
    }: Parameters<EstimateProvider["estimate"]>[1],
  ): Promise<ProviderResult> {
    let requestId: string | null = null;
    try {
      const response = await this.transport(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          redirect: "error",
          headers: {
            Authorization: "Bearer " + this.key,
            "Content-Type": "application/json",
          },
          signal,
          body: JSON.stringify({
            model,
            store: false,
            service_tier: "default",
            instructions,
            max_output_tokens: maxOutputTokens,
            input: [{ role: "user", content: JSON.stringify(context) }],
            tools: [],
            text: {
              format: {
                type: "json_schema",
                name: "effort_range",
                strict: true,
                schema: ProviderSuggestion,
              },
            },
          }),
        },
      );
      const header = response.headers.get("x-request-id");
      requestId =
        header && /^[a-zA-Z0-9_-]{1,128}$/.test(header) ? header : null;
      if (!response.ok) {
        // Only explicit request rejections release the reservation without reported usage.
        if ([400, 401, 403, 404, 413, 422, 429].includes(response.status))
          return {
            kind: "settled",
            requestId,
            usage: { input: 0, output: 0 },
            errorCode: "PROVIDER_REJECTED",
          };
        return { kind: "unknown", requestId };
      }
      const data = (await response.json()) as {
        status?: string;
        model?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
        output?: {
          type: string;
          role?: string;
          content?: { type: string; text?: string }[];
        }[];
      };
      const usage = {
        input: data.usage?.input_tokens,
        output: data.usage?.output_tokens,
      };
      if (!tokenCount(usage.input) || !tokenCount(usage.output))
        return { kind: "unknown", requestId };
      const settled = {
        kind: "settled" as const,
        requestId,
        usage: { input: usage.input, output: usage.output },
      };
      if (data.model !== model) return { kind: "unknown", requestId };
      if (data.status !== "completed")
        return { ...settled, errorCode: "PROVIDER_INCOMPLETE" };
      const content =
        data.output
          ?.filter(
            (item) => item.type === "message" && item.role === "assistant",
          )
          .flatMap((item) => item.content ?? []) ?? [];
      if (content.some((item) => item.type === "refusal"))
        return { ...settled, errorCode: "PROVIDER_REFUSED" };
      const messages = content.filter((item) => item.type === "output_text");
      if (
        messages.length !== 1 ||
        !messages[0].text ||
        messages[0].text.length > 8000
      )
        return { ...settled, errorCode: "PROVIDER_INVALID_OUTPUT" };
      try {
        return { ...settled, output: JSON.parse(messages[0].text) as unknown };
      } catch {
        return { ...settled, errorCode: "PROVIDER_INVALID_OUTPUT" };
      }
    } catch {
      return { kind: "unknown", requestId };
    }
  }
}
