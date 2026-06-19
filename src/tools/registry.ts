import { Tool } from "../core/tool";
import { FunctionTool } from "./function-tool";

/**
 * In-memory collection of tools available to an agent.
 *
 * The registry is the TypeScript-side source of truth. For a custom text tool
 * flow, its descriptions are rendered into the system prompt. For native
 * OpenAI tool calling, its tools can be mapped to `tool.toOpenAISchema()`.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  /**
   * Adds or replaces a tool by name.
   */
  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Removes a tool from the registry.
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Finds a tool by name.
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Convenience helper for wrapping a simple `(input) => output` function as a
   * one-parameter tool.
   */
  registerFunction(
    name: string,
    description: string,
    fn: (input: string) => string | Promise<string>,
  ): void {
    this.registerTool(new FunctionTool(name, description, fn));
  }

  /**
   * Executes a registered tool using the conventional `{ input }` parameter.
   */
  async executeTool(name: string, inputText: string): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      return `Error: tool '${name}' was not found.`;
    }

    try {
      return await tool.run({ input: inputText });
    } catch (error) {
      return `Error while executing tool '${name}': ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Renders tools and parameter metadata as prompt text for custom tool calls.
   */
  getToolsDescription(): string {
    const descriptions = [...this.tools.values()].map(
      (tool) =>
        `- ${tool.name}: ${tool.description}\n  Parameters: ${tool
          .getParameters()
          .map(
            (parameter) =>
              `${parameter.name} (${parameter.type}${parameter.required ?? true ? ", required" : ""}): ${parameter.description}`,
          )
          .join("; ")}`,
    );
    return descriptions.length ? descriptions.join("\n") : "No tools available";
  }

  /**
   * Lists registered tool names.
   */
  listTools(): string[] {
    return [...this.tools.keys()];
  }

  /**
   * Returns all registered tool objects.
   */
  getAllTools(): Tool[] {
    return [...this.tools.values()];
  }

  /**
   * Removes every registered tool.
   */
  clear(): void {
    this.tools.clear();
  }
}

/**
 * Optional shared registry for experiments that do not need isolated state.
 */
export const globalRegistry = new ToolRegistry();
