import { Agent } from "../../core/agent";
import { Message } from "../../core/message";
import { AgentOptions, InvokeOptions } from "../../core/types";
import {
  DEFAULT_EXECUTOR_PROMPT,
  Executor,
  StepResult,
} from "./executor-agent";
import { DEFAULT_PLANNER_PROMPT, Planner } from "./planner-agent";

export type PlanAndSolvePrompts = {
  planner: string;
  executor: string;
};

export type PlanAndSolveAgentOptions = {
  customPrompts?: Partial<PlanAndSolvePrompts>;
} & AgentOptions;

/**
 * Agent that solves a task by first planning, then executing each plan step.
 *
 * The flow is intentionally split into two smaller collaborators:
 * - `Planner` turns the user question into ordered executable steps.
 * - `Executor` runs each step while carrying previous step results forward.
 */
export class PlanAndSolveAgent extends Agent {
  readonly currentHistory: string[];
  private readonly planner: Planner;
  private readonly executor: Executor;

  constructor(options: PlanAndSolveAgentOptions) {
    super(options);

    this.currentHistory = [];
    this.planner = new Planner(this.llm, {
      promptTemplate: options.customPrompts?.planner ?? DEFAULT_PLANNER_PROMPT,
    });
    this.executor = new Executor(this.llm, {
      promptTemplate:
        options.customPrompts?.executor ?? DEFAULT_EXECUTOR_PROMPT,
    });
  }

  /**
   * Generates a plan, executes it step by step, stores the final exchange, and
   * returns the final step result as the answer.
   */
  async run(inputText: string, options?: InvokeOptions): Promise<string> {
    const plan = await this.planner.plan(inputText, options);
    if (!plan.length) {
      const failure = "Could not generate a valid plan.";
      this.saveConversation(inputText, failure);
      return failure;
    }

    const results = await this.executor.executeWithResults(
      inputText,
      plan,
      options,
    );

    this.currentHistory.length = 0;
    this.currentHistory.push(...this.formatResults(results));

    const finalAnswer = results.at(-1)?.result ?? "";
    this.saveConversation(inputText, finalAnswer);
    return finalAnswer;
  }

  private formatResults(results: StepResult[]): string[] {
    return results.map(
      ({ step, result }, index) =>
        `Step ${index + 1}: ${step}\nResult: ${result}`,
    );
  }

  private saveConversation(inputText: string, answer: string): void {
    this.addMessage(new Message(inputText, "user"));
    this.addMessage(new Message(answer, "assistant"));
  }
}
