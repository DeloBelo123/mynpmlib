import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export type TavilyTopic = "general" | "news" | "finance";
export type TavilySearchDepth = "basic" | "advanced";
export type TavilyTimeRange = "day" | "week" | "month" | "year";

/**
 * Tavily `include_answer` kann laut API-Doku:
 * - false/true
 * - "basic" (quick answer)
 * - "advanced" (detailed answer)
 */
export type TavilyIncludeAnswer = boolean | "basic" | "advanced";

export type TavilyRawContentMode = boolean | "markdown" | "text";

export type TavilyImageResult =
  | string
  | { url: string; description?: string };

export type TavilySearchResult = {
  title: string;
  url: string;
  content: string;
  score: number;
  raw_content?: string | null;
  published_date?: string; // kann vorhanden sein, je nach Quelle
};

export type TavilySearchResponse = {
  query: string;
  answer?: string;
  images?: TavilyImageResult[];
  results: TavilySearchResult[];
  response_time: number;
  request_id?: string;
  usage?: { credits: number };
  auto_parameters?: Record<string, unknown>;
  follow_up_questions?: unknown; // Tavily kann sowas liefern (optional)
};

export type TavilySearchInit = {
  tavilyApiKey?: string;
  apiBaseUrl?: string; // default https://api.tavily.com
  maxResults?: number; // max_results
  topic?: TavilyTopic;
  searchDepth?: TavilySearchDepth; // search_depth
  timeRange?: TavilyTimeRange; // time_range
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  days?: number; // (einige SDKs/Wrapper nutzen days; Tavily API nutzt time_range/start/end primär)
  country?: string;

  includeDomains?: string[];
  excludeDomains?: string[];

  includeAnswer?: TavilyIncludeAnswer; // include_answer
  includeRawContent?: TavilyRawContentMode; // include_raw_content
  includeImages?: boolean; // include_images
  includeImageDescriptions?: boolean; // include_image_descriptions
  includeUsage?: boolean; // include_usage
  autoParameters?: boolean; // auto_parameters

  /**
   * Optional: nur wenn du exakt das LangChain-Verhalten willst,
   * dass includeAnswer/includeRawContent nicht pro invoke überschrieben werden dürfen.
   * (LangChain-Doku nennt diese Einschränkung.) :contentReference[oaicite:2]{index=2}
   */
  lockResponseSizeParams?: boolean;

  /**
   * Optionaler Default Timeout in ms
   */
  timeoutMs?: number;
};

export type TavilySearchInvoke = {
  query: string;

  // diese dürfen typischerweise pro call überschrieben werden:
  maxResults?: number;
  topic?: TavilyTopic;
  searchDepth?: TavilySearchDepth;
  timeRange?: TavilyTimeRange;
  startDate?: string;
  endDate?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  includeImages?: boolean;
  includeImageDescriptions?: boolean;
  includeUsage?: boolean;
  autoParameters?: boolean;

  // diese 2 sind bei LangChain “locked” (optional enforced via lockResponseSizeParams)
  includeAnswer?: TavilyIncludeAnswer;
  includeRawContent?: TavilyRawContentMode;

  /**
   * Optional: AbortSignal (z.B. Timeout/Cancel)
   */
  signal?: AbortSignal;
};

export class TavilySearch {
  public readonly name = "tavily_search";
  public readonly description =
    "Search the web with Tavily and return LLM-friendly results with sources.";

  private readonly apiKey: string;
  private readonly baseUrl: string;

  // defaults
  private readonly defaults: Omit<TavilySearchInit, "tavilyApiKey" | "apiBaseUrl">;

  constructor(params: TavilySearchInit = {}) {
    const apiKey = params.tavilyApiKey ?? process.env.TAVILY_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Missing Tavily API key. Provide `tavilyApiKey` or set process.env.TAVILY_API_KEY."
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = (params.apiBaseUrl ?? "https://api.tavily.com").replace(/\/$/, "");
    const { tavilyApiKey, apiBaseUrl, ...rest } = params;
    this.defaults = rest;
  }

  async invoke(input: TavilySearchInvoke): Promise<TavilySearchResponse> {
    const lock = this.defaults.lockResponseSizeParams ?? true;

    // Merge defaults -> per-call overrides
    const merged: any = {
      ...this.defaults,
      ...input,
    };

    // If locked, disallow overriding includeAnswer/includeRawContent at call time
    if (lock) {
      if (
        typeof input.includeAnswer !== "undefined" &&
        typeof this.defaults.includeAnswer !== "undefined" &&
        input.includeAnswer !== this.defaults.includeAnswer
      ) {
        throw new Error(
          "includeAnswer is locked (response-size sensitive). Set it in the constructor, not per invoke."
        );
      }
      if (
        typeof input.includeRawContent !== "undefined" &&
        typeof this.defaults.includeRawContent !== "undefined" &&
        input.includeRawContent !== this.defaults.includeRawContent
      ) {
        throw new Error(
          "includeRawContent is locked (response-size sensitive). Set it in the constructor, not per invoke."
        );
      }
    }

    // Map camelCase -> Tavily API snake_case
    const body: Record<string, unknown> = {
      query: input.query,
    };

    // Tavily parameter names per API docs :contentReference[oaicite:3]{index=3}
    if (merged.maxResults != null) body.max_results = merged.maxResults;
    if (merged.topic != null) body.topic = merged.topic;
    if (merged.searchDepth != null) body.search_depth = merged.searchDepth;
    if (merged.timeRange != null) body.time_range = merged.timeRange;
    if (merged.startDate != null) body.start_date = merged.startDate;
    if (merged.endDate != null) body.end_date = merged.endDate;
    if (merged.includeDomains != null) body.include_domains = merged.includeDomains;
    if (merged.excludeDomains != null) body.exclude_domains = merged.excludeDomains;
    if (merged.includeAnswer != null) body.include_answer = merged.includeAnswer;
    if (merged.includeRawContent != null) body.include_raw_content = merged.includeRawContent;
    if (merged.includeImages != null) body.include_images = merged.includeImages;
    if (merged.includeImageDescriptions != null)
      body.include_image_descriptions = merged.includeImageDescriptions;
    if (merged.includeUsage != null) body.include_usage = merged.includeUsage;
    if (merged.autoParameters != null) body.auto_parameters = merged.autoParameters;

    // Optional extras (country/days etc. exist in some Tavily wrappers; Tavily docs list a lot)
    if (merged.country != null) body.country = merged.country;
    if (merged.days != null) body.days = merged.days;

    // Timeout support via AbortController (optional)
    const timeoutMs = this.defaults.timeoutMs;
    let controller: AbortController | undefined;
    let timeoutId: any;

    const externalSignal = input.signal;
    let signal = externalSignal;

    if (timeoutMs && typeof AbortController !== "undefined") {
      controller = new AbortController();
      // if externalSignal aborts -> abort our controller too
      if (externalSignal) {
        externalSignal.addEventListener("abort", () => controller?.abort(externalSignal.reason), {
          once: true,
        });
      }
      timeoutId = setTimeout(() => controller?.abort(new Error("Tavily request timeout")), timeoutMs);
      signal = controller.signal;
    }

    try {
      const res = await fetch(`${this.baseUrl}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Auth per Tavily API reference :contentReference[oaicite:4]{index=4}
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Tavily error ${res.status}: ${text || res.statusText}`);
      }

      const json = (await res.json()) as TavilySearchResponse;
      return json;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}

export const tavilySearchTool = new DynamicStructuredTool({
    func:async ({ query }: { query: string }) => {
        const tavily = new TavilySearch({
            tavilyApiKey: process.env.TAVILY_API_KEY,
            topic: "general",
            includeAnswer: false,
            maxResults: 5,
        });
        return await tavily.invoke({ query });
        
      },
    schema: z.object({
        query: z.string().describe("The search query"),
    }),
    name: "tavily_search",
    description: "Search the web with Tavily and return LLM-friendly results with sources.",
})