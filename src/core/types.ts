import { AgentsLLM } from "./llm";

/**
 * Provider names understood by the learning LLM wrapper.
 *
 * `custom` means "an OpenAI-compatible endpoint that this package does not
 * recognize by name." It still uses the OpenAI SDK client shape.
 */
export type SupportedProvider = "deepseek" | "ollama" | "local" | "custom";

/**
 * Constructor options for `AgentsLLM`.
 *
 * All fields are optional so the wrapper can fall back to environment
 * variables and provider defaults while you experiment.
 */
export type AgentsLLMOptions = {
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
  llm: AgentsLLM;
  systemPrompt?: string;
  config?: any;
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
