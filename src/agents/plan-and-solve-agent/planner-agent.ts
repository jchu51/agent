import type { LLM } from "../../core/llm";
import type { ChatMessage, InvokeOptions } from "../../core/types";

export const DEFAULT_PLANNER_PROMPT = `
    You are a top-tier AI planning expert. Your task is to break down a complex user question into an action plan made of multiple simple steps.
    Make sure each step in the plan is an independent, executable subtask, and that all steps are arranged in strict logical order.
    Your output must be a JavaScript array where each element is a string describing one subtask.
    Question: {question}
    Please output your plan strictly in the following format:
    \`\`\`ts
        ["Step 1", "Step 2", "Step 3"]
    \`\`\`
`;

export type PlannerOptions = {
  promptTemplate?: string;
};

/**
 * Planner responsible for decomposing a complex question into executable steps.
 *
 * This mirrors the Python `Planner` concept from the learning reference, but in
 * TypeScript the LLM call is async and the expected plan is a JavaScript string
 * array rather than a Python list.
 */
export class Planner {
  private readonly llm: LLM;
  private readonly promptTemplate: string;

  constructor(llm: LLM, options: PlannerOptions = {}) {
    this.llm = llm;
    this.promptTemplate = options.promptTemplate ?? DEFAULT_PLANNER_PROMPT;
  }

  /**
   * Generates a step-by-step plan for a question.
   *
   * The model is asked to return a fenced JavaScript/TypeScript array. The
   * parser is intentionally tolerant and can also handle a raw JSON-style array
   * if the model omits the code fence.
   */
  async plan(question: string, options: InvokeOptions = {}): Promise<string[]> {
    const prompt = this.promptTemplate.replace("{question}", question);
    const messages: ChatMessage[] = [{ role: "user", content: prompt }];

    const responseText = await this.llm.invoke(messages, options);
    return this.parsePlan(responseText);
  }

  private parsePlan(responseText: string): string[] {
    const planText = this.extractPlanText(responseText);

    try {
      const parsed = JSON.parse(planText) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter((step): step is string => typeof step === "string");
    } catch {
      return [];
    }
  }

  private extractPlanText(responseText: string): string {
    const fencedBlock = responseText.match(
      /```(?:ts|typescript|js|javascript|json|python)?\s*([\s\S]*?)```/i,
    );

    return (fencedBlock?.[1] ?? responseText).trim();
  }
}
