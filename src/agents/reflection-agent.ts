import { Agent } from "../core/agent";
import { Message } from "../core/message";
import { AgentOptions, ChatMessage } from "../core/types";
import { ToolRegistry } from "../tools/registry";

export const DEFAULT_PROMPTS = {
  initial: `Please complete the task according to the following requirements:

Task: {task}

{tool_instructions}

Please provide a complete and accurate answer.
`,
  reflect: `Please carefully review the following answer and identify any possible issues or areas for improvement:

# Original Task:
{task}

# Current Answer:
{content}

Please analyze the quality of this answer, point out any shortcomings, and provide specific suggestions for improvement.
If the answer is already good, respond with "No improvement needed".
`,
  refine: `Please improve your answer based on the feedback:

# Original Task:
{task}

# Previous Answer:
{last_attempt}

# Feedback:
{feedback}

{tool_instructions}

Please provide an improved answer.
`,
} as const;

export type ReflectionPrompts = Record<keyof typeof DEFAULT_PROMPTS, string>;

export type ReflectionAgentOptions = {
  toolRegistry?: ToolRegistry;
  maxToolIterations?: number;
  customPrompts?: Partial<ReflectionPrompts>;
  noImprovementPattern?: RegExp;
} & AgentOptions;

export class ReflectionAgent extends Agent {
  readonly currentHistory: string[];
  readonly toolRegistry: ToolRegistry;
  readonly maxToolIterations: number;
  private readonly prompts: ReflectionPrompts;
  private readonly noImprovementPattern: RegExp;

  constructor(options: ReflectionAgentOptions) {
    super(options);

    this.currentHistory = [];
    this.toolRegistry = options.toolRegistry ?? new ToolRegistry();
    this.maxToolIterations = options.maxToolIterations ?? 3;
    this.prompts = { ...DEFAULT_PROMPTS, ...options.customPrompts };
    this.noImprovementPattern =
      options.noImprovementPattern ?? /^no improvement needed\.?$/i;
  }

  async run(
    inputText: string,
    options?: Record<string, unknown>,
  ): Promise<string> {
    this.currentHistory.length = 0;

    const initialPrompt = this.prompts.initial
      .replace("{task}", inputText)
      .replace("{tool_instructions}", this.getToolInstructions());

    const content = await this.invokeWithOptionalTools(initialPrompt, options);
    if (!content) {
      this.currentHistory.push("Initial: No answer provided");
      return "";
    }

    this.currentHistory.push(`Initial: ${content}`);

    const reflectPrompt = this.prompts.reflect
      .replace("{task}", inputText)
      .replace("{content}", content);

    const feedback = (
      await this.llm.invoke([{ role: "user", content: reflectPrompt }])
    ).trim();

    if (!feedback) {
      this.currentHistory.push("Reflect: No answer provided");
      this.saveConversation(inputText, content);
      return content;
    }

    if (this.isNoImprovementNeeded(feedback)) {
      this.currentHistory.push("Reflect: No improvement needed");
      this.saveConversation(inputText, content);
      return content;
    }

    this.currentHistory.push(`Reflect: ${feedback}`);

    const refinePrompt = this.prompts.refine
      .replace("{task}", inputText)
      .replace("{last_attempt}", content)
      .replace("{feedback}", feedback)
      .replace("{tool_instructions}", this.getToolInstructions());

    const answer = await this.invokeWithOptionalTools(refinePrompt, options);
    if (!answer) {
      this.currentHistory.push("Refine: No answer provided");
      this.saveConversation(inputText, content);
      return content;
    }

    this.currentHistory.push(`Refine: ${answer}`);
    this.saveConversation(inputText, answer);
    return answer;
  }

  private saveConversation(inputText: string, answer: string): void {
    this.addMessage(new Message(inputText, "user"));
    this.addMessage(new Message(answer, "assistant"));
  }

  private getToolInstructions(): string {
    const toolsDescription = this.toolRegistry.getToolsDescription();
    if (toolsDescription === "No tools available") {
      return "";
    }

    return `Available tools:
${toolsDescription}

If a tool is needed, respond only with:
\`[TOOL_CALL:{tool_name}:{input}]\`

After tool results are provided, produce the final answer.`;
  }

  private async invokeWithOptionalTools(
    prompt: string,
    options?: Record<string, unknown>,
  ): Promise<string> {
    const messages: ChatMessage[] = [{ role: "user", content: prompt }];
    const maxToolIterations = Number(
      options?.maxToolIterations ?? this.maxToolIterations,
    );

    for (let i = 0; i < maxToolIterations; i++) {
      const response = await this.llm.invoke(messages);
      const toolCall = this.parseToolCall(response);

      if (!toolCall) {
        return response;
      }

      const observation = await this.toolRegistry.executeTool(
        toolCall.toolName,
        toolCall.toolInput,
      );

      this.currentHistory.push(
        `Tool: ${toolCall.toolName}[${toolCall.toolInput}]`,
      );
      this.currentHistory.push(`Observation: ${observation}`);

      messages.push({ role: "assistant", content: response });
      messages.push({
        role: "user",
        content: `Tool result:\n${observation}\n\nPlease provide the final answer.`,
      });
    }

    return this.llm.invoke(messages);
  }

  private parseToolCall(
    text: string,
  ): { toolName: string; toolInput: string } | undefined {
    const match = text.trim().match(/^\[TOOL_CALL:([^:\]]+):([\s\S]*)\]$/);
    if (!match?.[1]) return undefined;
    return {
      toolName: match[1].trim(),
      toolInput: match[2]?.trim() ?? "",
    };
  }

  private isNoImprovementNeeded(feedback: string): boolean {
    this.noImprovementPattern.lastIndex = 0;
    return this.noImprovementPattern.test(feedback.trim());
  }
}
