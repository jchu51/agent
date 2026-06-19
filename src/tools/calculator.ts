import { Tool } from "../core/tool";
import { ToolParameter } from "../core/types";

const ALLOWED_NAMES: Record<string, string | number> = {
  abs: "Math.abs",
  round: "Math.round",
  max: "Math.max",
  min: "Math.min",
  sqrt: "Math.sqrt",
  sin: "Math.sin",
  cos: "Math.cos",
  tan: "Math.tan",
  log: "Math.log",
  exp: "Math.exp",
  pi: Math.PI,
  e: Math.E,
};

/**
 * Tiny calculator tool for arithmetic expressions.
 *
 * It is intentionally small for learning. The implementation validates a narrow
 * character set, then evaluates the expression with JavaScript's `Function`
 * constructor. A production app should use a real math parser instead.
 */
export class CalculatorTool extends Tool {
  constructor() {
    super(
      "calculator",
      "Execute math calculations. Supports basic arithmetic and common math functions, such as 2+3*4, sqrt(16), sin(pi/2).",
    );
  }

  /**
   * Calculator accepts one string expression.
   */
  getParameters(): ToolParameter[] {
    return [
      {
        name: "input",
        type: "string",
        description: "Math expression to evaluate",
        required: true,
      },
    ];
  }

  /**
   * Evaluates the provided math expression.
   */
  run(parameters: Record<string, unknown>): string {
    const expression = String(
      parameters.input ?? parameters.expression ?? "",
    ).trim();
    if (!expression) {
      return "Error: expression cannot be empty.";
    }

    try {
      return String(evaluateExpression(expression));
    } catch (error) {
      return `Calculation failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

/**
 * Convenience helper for evaluating one expression without managing a registry.
 */
export function calculate(expression: string): string {
  return new CalculatorTool().run({ input: expression });
}

/**
 * Normalizes supported math names and evaluates the expression.
 */
function evaluateExpression(expression: string): number {
  let normalized = expression.toLowerCase();

  for (const [name, replacement] of Object.entries(ALLOWED_NAMES)) {
    const pattern = new RegExp(`\\b${name}\\b`, "g");
    normalized = normalized.replace(pattern, String(replacement));
  }

  if (!/^[0-9+\-*/%^().,\sMathabcegilnorstxPI]+$/.test(normalized)) {
    throw new Error("unsupported characters or identifiers");
  }

  const jsExpression = normalized.replace(/\^/g, "**");
  const result = Function(`"use strict"; return (${jsExpression});`)();

  if (typeof result !== "number" || Number.isNaN(result)) {
    throw new Error("expression did not return a valid number");
  }

  return result;
}
