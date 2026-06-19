import "dotenv/config";

import OpenAI from "openai";
import {
  LLMOptions,
  ChatMessage,
  InvokeOptions,
  SupportedProvider,
} from "./types";
import { AgentsError } from "./exceptions";

/**
 * Small wrapper around the OpenAI SDK for OpenAI-compatible chat APIs.
 *
 * The OpenAI SDK is used here as a generic HTTP client. It can call OpenAI,
 * DeepSeek, Ollama, or a local/custom server as long as that server exposes an
 * OpenAI-compatible API and you provide the right `apiKey`, `baseUrl`, and
 * `model`.
 */
export class LLM {
  readonly model: string;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly provider: SupportedProvider;
  readonly temperature: number;
  readonly timeoutSeconds: number;
  readonly client: OpenAI;
  readonly maxTokens?: number;

  /**
   * Creates an LLM client configuration.
   *
   * If `options.provider` is missing, the constructor tries to infer the
   * provider from environment variables, the API key, or the base URL.
   *
   * After the provider is known, credentials are resolved in this order:
   * explicit options first, then provider-specific environment variables,
   * then generic `LLM_*` environment variables, then provider defaults.
   *
   * @throws {AgentsError} When no usable API key or base URL can be resolved.
   */
  constructor(options: LLMOptions = {}) {
    this.temperature = options.temperature ?? 0.7;
    this.maxTokens = options.maxTokens;
    this.timeoutSeconds =
      options.timeoutSeconds ?? Number(process.env.LLM_TIMEOUT ?? "60");
    this.provider =
      options.provider ??
      this.autoDetectProvider(options.apiKey, options.baseUrl);

    const credentials = this.resolveCredentials(
      options.apiKey,
      options.baseUrl,
    );

    this.apiKey = credentials.apiKey;
    this.baseUrl = credentials.baseUrl;
    this.model =
      options.model ?? process.env.LLM_MODEL_ID ?? this.defaultModel();

    if (!this.apiKey || !this.baseUrl) {
      throw new AgentsError(
        "LLM apiKey and baseUrl must be provided through options or environment variables.",
      );
    }

    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      timeout: this.timeoutSeconds * 1000,
    });
  }

  /**
   * Resolves the API key and base URL for the selected provider.
   *
   * The explicit constructor values always win. Environment variables are a
   * convenience fallback so callers can configure the client without passing
   * secrets through code.
   *
   * Provider examples:
   * - `deepseek`: uses `DEEPSEEK_API_KEY` and DeepSeek's OpenAI-compatible URL.
   * - `ollama`: uses the local Ollama OpenAI-compatible endpoint by default.
   * - `local`: assumes a local OpenAI-compatible server on port 8000.
   * - `custom`: requires explicit or generic `LLM_API_KEY` / `LLM_BASE_URL`.
   */
  private resolveCredentials = (
    apiKey?: string,
    baseUrl?: string,
  ): { apiKey: string; baseUrl: string } => {
    switch (this.provider) {
      case "deepseek":
        return {
          apiKey:
            apiKey ??
            process.env.DEEPSEEK_API_KEY ??
            process.env.LLM_API_KEY ??
            "",
          baseUrl:
            baseUrl ?? process.env.LLM_BASE_URL ?? "https://api.deepseek.com",
        };

      case "ollama":
        return {
          apiKey:
            apiKey ??
            process.env.OLLAMA_API_KEY ??
            process.env.LLM_API_KEY ??
            "ollama",
          baseUrl:
            baseUrl ??
            process.env.OLLAMA_HOST ??
            process.env.LLM_BASE_URL ??
            "http://localhost:11434/v1",
        };

      case "local":
        return {
          apiKey: apiKey ?? process.env.LLM_API_KEY ?? "local",
          baseUrl:
            baseUrl ?? process.env.LLM_BASE_URL ?? "http://localhost:8000/v1",
        };

      default:
        return {
          apiKey: apiKey ?? process.env.LLM_API_KEY ?? "",
          baseUrl: baseUrl ?? process.env.LLM_BASE_URL ?? "",
        };
    }
  };

  /**
   * Guesses the provider from available configuration.
   *
   * This does not contact any remote API. It only inspects environment
   * variables and recognizable API key/base URL patterns.
   *
   * If no known provider is recognized, this returns `custom`, which means:
   * "use the provided or generic OpenAI-compatible endpoint as-is."
   */
  private autoDetectProvider = (
    apiKey?: string,
    baseUrl?: string,
  ): SupportedProvider => {
    if (process.env.DEEPSEEK_API_KEY) return "deepseek";
    if (process.env.OLLAMA_API_KEY || process.env.OLLAMA_HOST) return "ollama";

    const actualApiKey = apiKey ?? process.env.LLM_API_KEY;
    const actualBaseUrl = baseUrl ?? process.env.LLM_BASE_URL;

    if (actualApiKey?.toLowerCase() === "ollama") return "ollama";

    const lowerBaseUrl = actualBaseUrl?.toLowerCase() ?? "";
    if (lowerBaseUrl.includes("api.deepseek.com")) return "deepseek";

    if (
      lowerBaseUrl.includes("localhost") ||
      lowerBaseUrl.includes("127.0.0.1")
    ) {
      if (lowerBaseUrl.includes(":11434")) return "ollama";
      return "local";
    }

    return "custom";
  };

  /**
   * Selects a model name when the caller did not pass `options.model`.
   *
   * Model names are provider-specific. A model that works for one provider
   * may not exist on another provider, even though the API shape is the same.
   */
  private defaultModel(): string {
    switch (this.provider) {
      case "deepseek":
        return "deepseek-chat";
      case "local":
        return "local-model";
      default:
        return "deepseek-chat";
    }
  }

  async invoke(
    messages: ChatMessage[],
    options: InvokeOptions = {},
  ): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages,
        temperature: options.temperature ?? this.temperature,
        max_tokens: options.maxTokens ?? this.maxTokens,
      });

      return response.choices[0]?.message.content ?? "";
    } catch (error) {
      throw new AgentsError(
        `LLM call failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async *streamInvoke(
    messages: ChatMessage[],
    options: InvokeOptions = {},
  ): AsyncGenerator<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages,
        temperature: options.temperature ?? this.temperature,
        max_tokens: options.maxTokens ?? this.maxTokens,
        stream: true,
      });

      for await (const chunk of response) {
        const content = chunk.choices[0]?.delta.content ?? "";
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      throw new AgentsError(
        `Streaming LLM call failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
