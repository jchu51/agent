import { Tool } from "../core/tool";
import { ToolParameter } from "../core/types";

/**
 * Adapter that turns a simple function into a `Tool`.
 */
export class FunctionTool extends Tool {
  private readonly fn: (input: string) => string | Promise<string>;

  constructor(
    name: string,
    description: string,
    fn: (input: string) => string | Promise<string>,
  ) {
    super(name, description);
    this.fn = fn;
  }

  /**
   * Function tools accept a single string input.
   */
  getParameters(): ToolParameter[] {
    return [
      {
        name: "input",
        type: "string",
        description: "Input text for the function tool",
        required: true,
      },
    ];
  }

  /**
   * Executes the wrapped function with `parameters.input`.
   */
  async run(parameters: Record<string, unknown>): Promise<string> {
    return this.fn(String(parameters.input ?? ""));
  }
}
