import type { LLM } from "../../core/llm";
import type { ChatMessage, InvokeOptions } from "../../core/types";

export const DEFAULT_EXECUTOR_PROMPT = `You are a top-tier AI execution expert. Your task is to solve the problem step by step by strictly following the given plan.

You will receive the original question, the complete plan, and the steps/results completed so far.

Focus only on solving the "current step", and output only the final answer for that step. Do not output any extra explanation or conversation.

# Original Question
{question}

# Complete Plan
{plan}

# Completed Steps And Results
{history}

# Current Step
{current_step}

Output only the answer for the "current step":
`;

export type ExecutorOptions = {
  promptTemplate?: string;
};

export type StepResult = {
  step: string;
  result: string;
};

/**
 * Executor responsible for solving a generated plan one step at a time.
 *
 * The executor does not create the plan. It receives a question and a plan,
 * then repeatedly asks the LLM to solve only the current step while giving it
 * the previous step results as context.
 */
export class Executor {
  private readonly llm: LLM;
  private readonly promptTemplate: string;

  constructor(llm: LLM, options: ExecutorOptions = {}) {
    this.llm = llm;
    this.promptTemplate = options.promptTemplate ?? DEFAULT_EXECUTOR_PROMPT;
  }

  /**
   * Executes every step in order and returns the last step result.
   */
  async execute(
    question: string,
    plan: string[],
    options: InvokeOptions = {},
  ): Promise<string> {
    const results = await this.executeWithResults(question, plan, options);
    return results.at(-1)?.result ?? "";
  }

  /**
   * Executes every step in order and returns each step/result pair.
   *
   * This is useful for debugging, UI display, or wiring a higher-level
   * `PlanAndSolveAgent` that wants to expose execution history.
   */
  async executeWithResults(
    question: string,
    plan: string[],
    options: InvokeOptions = {},
  ): Promise<StepResult[]> {
    const results: StepResult[] = [];

    for (const step of plan) {
      const result = await this.executeStep(
        question,
        plan,
        results,
        step,
        options,
      );
      results.push({ step, result });
    }

    return results;
  }

  /**
   * Executes one step using all previous results as context.
   */
  async executeStep(
    question: string,
    plan: string[],
    previousResults: StepResult[],
    currentStep: string,
    options: InvokeOptions = {},
  ): Promise<string> {
    const prompt = this.buildPrompt(
      question,
      plan,
      previousResults,
      currentStep,
    );
    const messages: ChatMessage[] = [{ role: "user", content: prompt }];

    return this.llm.invoke(messages, options);
  }

  private buildPrompt(
    question: string,
    plan: string[],
    previousResults: StepResult[],
    currentStep: string,
  ): string {
    return this.promptTemplate
      .replace("{question}", question)
      .replace("{plan}", JSON.stringify(plan, null, 2))
      .replace("{history}", this.formatHistory(previousResults))
      .replace("{current_step}", currentStep);
  }

  private formatHistory(results: StepResult[]): string {
    if (!results.length) {
      return "None";
    }

    return results
      .map(
        ({ step, result }, index) =>
          `Step ${index + 1}: ${step}\nResult: ${result}`,
      )
      .join("\n\n");
  }
}
