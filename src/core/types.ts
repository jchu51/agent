import type { Config } from "./config";
import type { LLM } from "./llm";

/**
 * Provider names understood by the learning LLM wrapper.
 *
 * `custom` means "an OpenAI-compatible endpoint that this package does not
 * recognize by name." It still uses the OpenAI SDK client shape.
 */
export type SupportedProvider = "deepseek" | "ollama" | "local" | "custom";

/**
 * Constructor options for `LLM`.
 *
 * All fields are optional so the wrapper can fall back to environment
 * variables and provider defaults while you experiment.
 */
export type LLMOptions = {
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  provider?: SupportedProvider;
  temperature?: number;
  maxTokens?: number;
  timeoutSeconds?: number;
};

/**
 * Per-call overrides for a single LLM invocation.
 */
export type InvokeOptions = {
  temperature?: number;
  maxTokens?: number;
};

/**
 * Constructor options for an `Agent`.
 *
 * `name` and `llm` are required dependencies. `systemPrompt` and `config`
 * customize the agent behavior.
 */
export type AgentOptions = {
  name: string;
  llm: LLM;
  systemPrompt?: string;
  config?: Config;
};

/**
 * Roles accepted by Chat Completions messages in this learning project.
 */
export type MessageRole = "user" | "assistant" | "system";

/**
 * Extra metadata for a stored conversation message.
 */
export type MessageOptions = {
  timestamp?: Date;
  metadata?: Record<string, unknown>;
};

/**
 * Plain message shape sent to the OpenAI-compatible chat API.
 */
export type ChatMessage = {
  role: MessageRole;
  content: string;
};

/**
 * Basic runtime settings shared by agents.
 */
export type ConfigOptions = {
  maxIterations?: number;
  temperature?: number;
  timeoutSeconds?: number;
  verbose?: boolean;
};

export type ToolParameterType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "array"
  | "object";

/**
 * Parameter metadata for a tool.
 *
 * In the custom text-based tool flow, this metadata is rendered into the
 * system prompt so the model knows what arguments to produce. It can also be
 * converted into an OpenAI native tool schema with `Tool.toOpenAISchema()`.
 */
export type ToolParameter = {
  name: string;
  type: ToolParameterType;
  description: string;
  required?: boolean;
  default?: unknown;
};

/**
 * Minimal native OpenAI tool schema shape generated from a `Tool`.
 *
 * The current `SimpleAgent` uses custom text tool calls, but this type keeps
 * the tool abstraction ready for native OpenAI tool calling experiments.
 */
export type OpenAIToolSchema = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<
        string,
        {
          type: ToolParameterType;
          description: string;
          items?: { type: string };
        }
      >;
      required?: string[];
    };
  };
};
