import { Agent } from "../core/agent";
import { Message } from "../core/message";
import { AgentOptions } from "../core/types";
import { ToolRegistry } from "../tools/registry";

const DEFAULT_REACT_PROMPT = `You are an AI assistant with reasoning and action capabilities. You can think through the problem, choose appropriate tools to gather information, and finally provide an accurate answer.

## Available Tools
\${tools}

## Workflow
Please respond strictly in the following format. You may perform only one step at a time:

Thought: Analyze the current problem and think about what information is needed or what action should be taken.
Action: Choose one action. The format must be one of the following:
- \`{tool_name}[{tool_input}]\` - Call the specified tool
- \`Finish[final answer]\` - Use this when you have enough information to provide the final answer

## Important Reminders
1. Every response must include both Thought and Action.
2. Tool calls must strictly follow this format: tool_name[parameters].
3. Only use Finish when you are confident you have enough information to answer the question.
4. If the tool result is not enough, continue using another tool or the same tool with different parameters.

## Current Task
**Question:** \${question}

## Execution History
\${history}

Now begin your reasoning and action:
`;

export type ReActAgentOptions = {
  /**
   * Tools the agent may call during the Thought/Action loop.
   */
  toolRegistry?: ToolRegistry;
  /**
   * Maximum number of Thought/Action/Observation steps before the agent gives
   * up with a fallback answer.
   */
  maxSteps?: number;
  /**
   * Optional prompt template. It must include `{tools}`, `{question}`, and
   * `{history}` placeholders if it wants the default ReAct behavior.
   */
  customPrompt?: string;
} & AgentOptions;

/**
 * ReAct-style agent that alternates between reasoning and actions.
 *
 * Unlike `SimpleAgent`, this agent asks the model to respond with a structured
 * `Thought:` and `Action:` pair. Actions are either tool calls such as
 * `calculator[5 + 10]` or `Finish[answer]`.
 */
export class ReActAgent extends Agent {
  readonly toolRegistry: ToolRegistry;
  readonly maxSteps: number;
  /**
   * Scratchpad for the current ReAct run.
   *
   * This is different from the base `history`. `currentHistory` stores
   * Thought/Action/Observation lines used inside the current prompt loop, while
   * `history` stores final user/assistant messages after a run completes.
   */
  readonly currentHistory: string[];
  private currentStep: number;
  private readonly promptTemplate: string;

  /**
   * Creates a ReAct agent with an optional isolated tool registry and prompt.
   */
  constructor(options: ReActAgentOptions) {
    super(options);

    this.toolRegistry = options.toolRegistry ?? new ToolRegistry();
    this.maxSteps = options.maxSteps ?? 5;
    this.currentHistory = [];
    this.currentStep = 0;
    this.promptTemplate = options.customPrompt ?? DEFAULT_REACT_PROMPT;
  }

  async run(
    inputText: string,
    _option?: Record<string, unknown>,
  ): Promise<string> {
    this.currentStep = 0;
    this.currentHistory.length = 0;

    while (this.currentStep < this.maxSteps) {
      this.currentStep++;

      const prompt = this.promptTemplate
        .replace("{tools}", this.toolRegistry.getToolsDescription())
        .replace("{question}", inputText)
        .replace("{history}", this.currentHistory.join("\n"));

      const response = await this.llm.invoke([
        { role: "user", content: prompt },
      ]);

      const { thought, action } = this.parseOutput(response);

      if (!action) {
        this.currentHistory.push("Observation: invalid action format.");
        continue;
      }

      if (action.startsWith("Finish")) {
        const finalAnswer = this.parseActionInput(action);
        this.addMessage(new Message(inputText, "user"));
        this.addMessage(new Message(finalAnswer, "assistant"));
        return finalAnswer;
      }

      const parsedAction = this.parseAction(action);
      if (!parsedAction) {
        this.currentHistory.push("Observation: invalid action syntax.");
        continue;
      }

      const observation = await this.toolRegistry.executeTool(
        parsedAction.toolName,
        parsedAction.toolInput,
      );

      if (thought) {
        this.currentHistory.push(`Thought: ${thought}`);
      }
      this.currentHistory.push(`Action: ${action}`);
      this.currentHistory.push(`Observation: ${observation}`);
    }

    const finalAnswer =
      "Sorry, I could not finish this task within the step limit.";
    this.addMessage(new Message(inputText, "user"));
    this.addMessage(new Message(finalAnswer, "assistant"));
    return finalAnswer;
  }

  /**
   * Extracts the model's latest Thought and Action lines.
   */
  private parseOutput(text: string): { thought?: string; action?: string } {
    return {
      thought: text.match(/Thought:\s*(.*)/)?.[1]?.trim(),
      action: text.match(/Action:\s*(.*)/)?.[1]?.trim(),
    };
  }

  /**
   * Returns the text inside `ToolName[...]` or `Finish[...]`.
   */
  private parseActionInput(actionText: string): string {
    return actionText.match(/^\w+\[(.*)\]$/)?.[1] ?? "";
  }

  /**
   * Parses a ReAct action string into the tool name and raw tool input.
   */
  private parseAction(
    actionText: string,
  ): { toolName: string; toolInput: string } | undefined {
    const match = actionText.match(/^(\w+)\[(.*)\]$/);
    if (!match?.[1]) return undefined;
    return {
      toolName: match[1],
      toolInput: match[2] ?? "",
    };
  }
}
