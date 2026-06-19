import { OpenAIToolSchema, ToolParameter } from "./types";

/**
 * Base class for executable tools.
 *
 * Tools expose human-readable metadata for prompting, a parameter schema for
 * parsing/coercion, and a `run` method that performs the actual work in local
 * code. The LLM never runs tools by itself; the agent decides when to call
 * `run`.
 */
export abstract class Tool {
  readonly name: string;
  readonly description: string;

  constructor(name: string, description: string) {
    this.name = name;
    this.description = description;
  }

  abstract run(parameters: Record<string, unknown>): Promise<string> | string;

  abstract getParameters(): ToolParameter[];

  /**
   * Checks that all required parameters are present before execution.
   */
  validateParameters(parameters: Record<string, unknown>): boolean {
    return this.getParameters()
      .filter((parameter) => parameter.required ?? true)
      .every(
        (parameter) =>
          parameters[parameter.name] !== undefined &&
          parameters[parameter.name] !== null,
      );
  }

  /**
   * Returns a serializable description useful for debugging or docs.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      description: this.description,
      parameters: this.getParameters(),
    };
  }

  /**
   * Converts this tool into OpenAI's native function tool schema.
   *
   * `SimpleAgent` currently uses a custom `[TOOL_CALL:...]` text protocol, but
   * this method shows the shape needed for native OpenAI tool calling.
   */
  toOpenAISchema(): OpenAIToolSchema {
    const properties: OpenAIToolSchema["function"]["parameters"]["properties"] =
      {};
    const required: string[] = [];

    for (const parameter of this.getParameters()) {
      properties[parameter.name] = {
        type: parameter.type,
        description:
          parameter.default === undefined
            ? parameter.description
            : `${parameter.description} (default: ${String(parameter.default)})`,
      };

      if (parameter.type === "array") {
        const property = properties[parameter.name];
        if (property) {
          property.items = { type: "string" };
        }
      }

      if (parameter.required ?? true) {
        required.push(parameter.name);
      }
    }

    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: "object",
          properties,
          required,
        },
      },
    };
  }

  toString(): string {
    return `Tool(name=${this.name})`;
  }
}
