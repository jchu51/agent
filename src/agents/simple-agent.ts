import { Agent } from "../core/agent";
import { Message } from "../core/message";
import { AgentOptions, ChatMessage } from "../core/types";
import { ToolRegistry } from "../tools/registry";

export type SimpleAgentOptions = {
  toolRegistry?: ToolRegistry;
  enableToolCalling?: boolean;
} & AgentOptions;

/**
 * Minimal chat agent implementation.
 *
 * `SimpleAgent` builds a Chat Completions message list from the system prompt,
 * previous in-memory history, and the latest user input. When a tool registry
 * is provided, it uses a custom text protocol where the model writes
 * `[TOOL_CALL:tool_name:parameters]` and the agent parses and executes it.
 */
export class SimpleAgent extends Agent {
  private toolRegistry?: ToolRegistry;
  private enableToolCalling: boolean;
  /**
   * Creates a simple agent.
   *
   * Tool calling is enabled only when a `toolRegistry` is provided and
   * `enableToolCalling` is not set to `false`.
   */
  constructor(options: SimpleAgentOptions) {
    super(options);

    this.toolRegistry = options.toolRegistry;
    this.enableToolCalling =
      (options.enableToolCalling ?? true) && Boolean(options.toolRegistry);
  }

  /**
   * Runs one non-streaming turn.
   *
   * With no tools, this is a single LLM call. With tools enabled, the agent
   * loops through model text, parses any `[TOOL_CALL:...]` requests, executes
   * local tools, appends tool results as user text, then asks for a final
   * answer.
   */
  async run(
    inputText: string,
    options?: Record<string, unknown>,
  ): Promise<string> {
    const messages = this.buildMessages(inputText);

    if (!this.enableToolCalling) {
      const response = await this.llm.invoke(messages);
      this.addMessage(new Message(inputText, "user"));
      this.addMessage(new Message(response, "assistant"));
      return response;
    }

    const maxToolIterations = Number(options?.maxToolIterations ?? 3);
    let finalResponse = "";

    for (let i = 0; i < maxToolIterations; i++) {
      const response = await this.llm.invoke(messages);
      const toolCalls = this.parseToolCalls(response);

      if (!toolCalls.length) {
        finalResponse = response;
        break;
      }

      messages.push({ role: "assistant", content: response });
      const toolResults: string[] = [];

      for (const call of toolCalls) {
        const result = await this.executeToolCall(
          call.toolName,
          call.parameters,
        );

        toolResults.push(result);
      }

      messages.push({
        role: "user",
        content: `Tool execution results:\n${toolResults.join("\n\n")}\n\nPlease provide the final answer using these results.`,
      });
    }

    if (!finalResponse) {
      finalResponse = await this.llm.invoke(messages);
    }

    this.addMessage(new Message(inputText, "user"));
    this.addMessage(new Message(finalResponse, "assistant"));

    return finalResponse;
  }

  /**
   * Streams one LLM turn without custom tool execution.
   *
   * This method currently streams directly from the LLM. It does not parse
   * streamed `[TOOL_CALL:...]` output mid-stream.
   */
  async *streamRun(inputText: string): AsyncGenerator<string> {
    const messages = this.buildMessages(inputText);
    let fullResponse = "";

    for await (const chunk of this.llm.streamInvoke(messages)) {
      fullResponse += chunk;
      yield chunk;
    }

    this.addMessage(new Message(inputText, "user"));
    this.addMessage(new Message(fullResponse, "assistant"));
  }

  /**
   * Builds the Chat Completions message array for one run.
   */
  private buildMessages(inputText: string): ChatMessage[] {
    const messages: ChatMessage[] = [
      { role: "system", content: this.getEnhancedSystemPrompt() },
    ];

    messages.push(...this.getHistory().map((message) => message.toObject()));
    messages.push({ role: "user", content: inputText });
    return messages;
  }

  /**
   * Returns the configured system prompt plus custom tool instructions.
   *
   * This is where the model learns that tools exist and what text format to
   * emit. Without these instructions, the LLM cannot see the TypeScript
   * `ToolRegistry`.
   */
  private getEnhancedSystemPrompt(): string {
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

      Tool call format:
      Use this exact format when you need a tool:
      \`[TOOL_CALL:{tool_name}:{parameters}]\`

      Examples:
      - \`[TOOL_CALL:calculator:input=12*8]\`
      - \`[TOOL_CALL:search:query=TypeScript agents]\`

      After tool results are provided, produce the final answer.`;
  }

  /**
   * Extracts custom text tool calls from an LLM response.
   */
  private parseToolCalls(text: string): ParsedToolCall[] {
    const pattern = /\[TOOL_CALL:([^:]+):([^\]]+)\]/g;
    const calls: ParsedToolCall[] = [];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const [, toolName, parameters] = match;
      if (!toolName || !parameters) continue;
      calls.push({
        toolName: toolName.trim(),
        parameters: parameters.trim(),
      });
    }

    return calls;
  }

  /**
   * Executes one parsed text tool call against the registry.
   */
  private async executeToolCall(
    toolName: string,
    parameters: string,
  ): Promise<string> {
    if (!this.toolRegistry) {
      return "Error: no tool registry configured.";
    }

    const tool = this.toolRegistry.getTool(toolName);
    if (!tool) {
      return `Error: tool '${toolName}' not found.`;
    }

    const parsedParameters = this.parseToolParameters(toolName, parameters);
    try {
      const result = await tool.run(parsedParameters);
      return `Tool ${toolName} result:\n${result}`;
    } catch (error) {
      return `Tool ${toolName} failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Parses the parameter section from `[TOOL_CALL:name:parameters]`.
   *
   * Supported forms:
   * - JSON: `{"input":"12*8"}`
   * - key/value text: `input=12*8`
   * - bare text fallback: `12*8` becomes `{ input: "12*8" }`
   */
  private parseToolParameters(
    toolName: string,
    parameters: string,
  ): Record<string, unknown> {
    const trimmed = parameters.trim();

    if (trimmed.startsWith("{")) {
      try {
        return this.convertParameterTypes(
          toolName,
          JSON.parse(trimmed) as Record<string, unknown>,
        );
      } catch {
        return { input: trimmed };
      }
    }

    if (trimmed.includes("=")) {
      const parsed: Record<string, unknown> = {};
      for (const pair of trimmed.split(",")) {
        const [key, ...rest] = pair.split("=");
        if (!key || !rest.length) continue;
        parsed[key.trim()] = rest.join("=").trim();
      }
      return this.convertParameterTypes(toolName, parsed);
    }

    return { input: trimmed };
  }

  /**
   * Coerces parsed string parameters based on the selected tool schema.
   *
   * Calculator only needs strings, but these conversions make the custom
   * protocol work for future tools with number, integer, or boolean inputs.
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
}

interface ParsedToolCall {
  toolName: string;
  parameters: string;
}
