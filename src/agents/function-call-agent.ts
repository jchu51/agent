import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
} from "openai/resources/chat/completions";

import { Agent } from "../core/agent";
import { Message } from "../core/message";
import { AgentOptions, ChatMessage, InvokeOptions } from "../core/types";
import { ToolRegistry } from "../tools/registry";

export type FunctionCallAgentOptions = {
  toolRegistry?: ToolRegistry;
  enableToolCalling?: boolean;
  defaultToolChoice?: ChatCompletionToolChoiceOption;
  maxToolIterations?: number;
} & AgentOptions;

export type FunctionCallRunOptions = InvokeOptions & {
  toolChoice?: ChatCompletionToolChoiceOption;
  maxToolIterations?: number;
};

/**
 * Agent that uses OpenAI-compatible native function calling.
 *
 * Unlike `SimpleAgent`, this agent does not ask the model to write a custom
 * `[TOOL_CALL:...]` text marker. It passes `tools` schemas to the Chat
 * Completions API, reads structured `message.tool_calls`, executes matching
 * local TypeScript tools, then sends each result back as a `role: "tool"`
 * message.
 */
export class FunctionCallAgent extends Agent {
  private toolRegistry?: ToolRegistry;
  private enableToolCalling: boolean;
  private defaultToolChoice: ChatCompletionToolChoiceOption;
  private maxToolIterations: number;

  /**
   * Creates a native function-calling agent.
   *
   * Tool calling is active only when a registry is provided and
   * `enableToolCalling` is not set to `false`.
   */
  constructor(options: FunctionCallAgentOptions) {
    super(options);

    this.toolRegistry = options.toolRegistry;
    this.enableToolCalling =
      (options.enableToolCalling ?? true) && Boolean(options.toolRegistry);
    this.defaultToolChoice = options.defaultToolChoice ?? "auto";
    this.maxToolIterations = options.maxToolIterations ?? 3;
  }

  /**
   * Runs one non-streaming conversation turn.
   *
   * If no native tool schemas are available, this falls back to a normal LLM
   * call. Otherwise, it loops while the model keeps returning tool calls, up to
   * `maxToolIterations`.
   */
  async run(
    inputText: string,
    options: FunctionCallRunOptions = {},
  ): Promise<string> {
    const messages = this.buildMessages(inputText);
    const tools = this.buildToolSchemas();

    if (!this.enableToolCalling || !tools.length) {
      const response = await this.llm.invoke(
        this.buildPlainMessages(inputText),
        options,
      );
      this.storeFinalTurn(inputText, response);
      return response;
    }

    const maxToolIterations =
      options.maxToolIterations ?? this.maxToolIterations;
    const toolChoice = options.toolChoice ?? this.defaultToolChoice;
    let finalResponse = "";
    let currentIteration = 0;

    while (currentIteration < maxToolIterations) {
      const response = await this.llm.client.chat.completions.create({
        model: this.llm.model,
        messages,
        tools,
        tool_choice: toolChoice,
        temperature: options.temperature ?? this.llm.temperature,
        max_tokens: options.maxTokens ?? this.llm.maxTokens,
      });

      const assistantMessage = response.choices[0]?.message;
      if (!assistantMessage) break;

      const toolCalls = assistantMessage.tool_calls ?? [];

      if (!toolCalls.length) {
        finalResponse = this.extractMessageContent(assistantMessage.content);
        messages.push({ role: "assistant", content: finalResponse });
        break;
      }

      messages.push(this.toAssistantToolCallMessage(assistantMessage));

      for (const toolCall of toolCalls) {
        if (toolCall.type !== "function") {
          continue;
        }

        const toolName = toolCall.function.name;
        const parameters = this.parseToolArguments(toolCall.function.arguments);
        const result = await this.executeToolCall(toolName, parameters);

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      currentIteration += 1;
    }

    if (!finalResponse) {
      const response = await this.llm.client.chat.completions.create({
        model: this.llm.model,
        messages,
        tools,
        tool_choice: "none",
        temperature: options.temperature ?? this.llm.temperature,
        max_tokens: options.maxTokens ?? this.llm.maxTokens,
      });

      finalResponse = this.extractMessageContent(
        response.choices[0]?.message.content,
      );
    }

    this.storeFinalTurn(inputText, finalResponse);
    return finalResponse;
  }

  /**
   * Adds a tool to this agent, creating a registry when needed.
   */
  addTool(tool: Parameters<ToolRegistry["registerTool"]>[0]): void {
    if (!this.toolRegistry) {
      this.toolRegistry = new ToolRegistry();
    }

    this.toolRegistry.registerTool(tool);
    this.enableToolCalling = true;
  }

  /**
   * Removes a tool by name.
   */
  removeTool(toolName: string): boolean {
    return this.toolRegistry?.unregister(toolName) ?? false;
  }

  /**
   * Lists tool names available to native function calling.
   */
  listTools(): string[] {
    return this.toolRegistry?.listTools() ?? [];
  }

  /**
   * Returns whether tool calling can be used by this agent.
   */
  hasTools(): boolean {
    return this.enableToolCalling && Boolean(this.toolRegistry);
  }

  /**
   * Streaming native tool calling is not implemented yet.
   *
   * This mirrors the Python learning version: run once, then yield the final
   * answer as a single chunk.
   */
  async *streamRun(
    inputText: string,
    options: FunctionCallRunOptions = {},
  ): AsyncGenerator<string> {
    yield await this.run(inputText, options);
  }

  /**
   * Builds the Chat Completions messages for the model call.
   */
  private buildMessages(inputText: string): ChatCompletionMessageParam[] {
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: this.getSystemPrompt() },
    ];

    messages.push(
      ...this.getHistory().map(
        (message): ChatCompletionMessageParam => ({
          role: message.role,
          content: message.content,
        }),
      ),
    );
    messages.push({ role: "user", content: inputText });

    return messages;
  }

  /**
   * Builds the smaller project-local message shape for plain `LLM.invoke`.
   */
  private buildPlainMessages(inputText: string): ChatMessage[] {
    const messages: ChatMessage[] = [
      { role: "system", content: this.getSystemPrompt() },
    ];

    messages.push(...this.getHistory().map((message) => message.toObject()));
    messages.push({ role: "user", content: inputText });

    return messages;
  }

  /**
   * Returns the base system prompt plus a small hint that native tools exist.
   */
  private getSystemPrompt(): string {
    const basePrompt = this.systemPrompt ?? "You are a helpful AI assistant.";

    if (!this.enableToolCalling || !this.toolRegistry) {
      return basePrompt;
    }

    const toolsDescription = this.toolRegistry.getToolsDescription();
    if (!toolsDescription || toolsDescription === "No tools available") {
      return basePrompt;
    }

    return `${basePrompt}

Available tools:
${toolsDescription}

When a tool is useful, call it through the provided native function-calling interface.`;
  }

  /**
   * Converts local tools into OpenAI-compatible native function schemas.
   */
  private buildToolSchemas(): ChatCompletionTool[] {
    if (!this.enableToolCalling || !this.toolRegistry) {
      return [];
    }

    return this.toolRegistry
      .getAllTools()
      .map((tool) => tool.toOpenAISchema() as ChatCompletionTool);
  }

  /**
   * Parses the JSON argument string returned by a function tool call.
   */
  private parseToolArguments(argumentsText: string): Record<string, unknown> {
    if (!argumentsText.trim()) {
      return {};
    }

    try {
      const parsed = JSON.parse(argumentsText) as unknown;
      return this.isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  /**
   * Executes a structured tool call against the local registry.
   */
  private async executeToolCall(
    toolName: string,
    parameters: Record<string, unknown>,
  ): Promise<string> {
    if (!this.toolRegistry) {
      return "Error: no tool registry configured.";
    }

    const tool = this.toolRegistry.getTool(toolName);
    if (!tool) {
      return `Error: tool '${toolName}' not found.`;
    }

    const typedParameters = this.convertParameterTypes(toolName, parameters);

    try {
      return await tool.run(typedParameters);
    } catch (error) {
      return `Tool ${toolName} failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Coerces model-provided JSON values based on the selected tool schema.
   */
  private convertParameterTypes(
    toolName: string,
    parameters: Record<string, unknown>,
  ): Record<string, unknown> {
    const tool = this.toolRegistry?.getTool(toolName);
    if (!tool) {
      return parameters;
    }

    const parameterTypes = new Map(
      tool.getParameters().map((parameter) => [parameter.name, parameter.type]),
    );
    const converted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(parameters)) {
      const type = parameterTypes.get(key);
      if (type === "number") {
        converted[key] = typeof value === "number" ? value : Number(value);
      } else if (type === "integer") {
        converted[key] =
          typeof value === "number"
            ? Math.trunc(value)
            : Number.parseInt(String(value), 10);
      } else if (type === "boolean") {
        converted[key] =
          typeof value === "boolean"
            ? value
            : ["true", "1", "yes"].includes(String(value).toLowerCase());
      } else {
        converted[key] = value;
      }
    }

    return converted;
  }

  /**
   * Keeps only the public user/final assistant turn in normal agent history.
   */
  private storeFinalTurn(inputText: string, finalResponse: string): void {
    this.addMessage(new Message(inputText, "user"));
    this.addMessage(new Message(finalResponse, "assistant"));
  }

  /**
   * Converts the SDK assistant message into the message shape required before
   * responding with `role: "tool"` messages.
   */
  private toAssistantToolCallMessage(message: {
    content: unknown;
    tool_calls?: ChatCompletionMessageToolCall[];
  }): ChatCompletionAssistantMessageParam {
    return {
      role: "assistant",
      content: this.extractMessageContent(message.content),
      tool_calls: message.tool_calls,
    };
  }

  /**
   * Safely extracts text from message content.
   */
  private extractMessageContent(content: unknown): string {
    if (content === null || content === undefined) {
      return "";
    }

    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (this.isRecord(item) && typeof item.text === "string") {
            return item.text;
          }
          return "";
        })
        .join("");
    }

    return String(content);
  }

  /**
   * Narrows unknown JSON values to plain records.
   */
  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
