import { Agent } from "../core/agent";
import { Message } from "../core/message";
import { AgentOptions, ChatMessage } from "../core/types";

/**
 * Minimal chat agent implementation.
 *
 * `SimpleAgent` builds a Chat Completions message list from the system prompt,
 * previous in-memory history, and the latest user input. It is intentionally
 * small so the LLM flow is easy to inspect while learning.
 */
export class SimpleAgent extends Agent {
  /**
   * Creates a simple agent using the base `AgentOptions`.
   */
  constructor(options: AgentOptions) {
    super(options);
  }

  /**
   * Sends the current prompt and history to the LLM, stores the final exchange,
   * and returns the assistant response.
   */
  async run(
    inputText: string,
    option?: Record<string, unknown>,
  ): Promise<string> {
    let finalResponse = "";
    const messages = this.buildMessages(inputText);
    const response = await this.llm.invoke(messages);

    messages.push({ role: "assistant", content: response });

    if (!finalResponse) {
      finalResponse = await this.llm.invoke(messages);
    }

    this.addMessage(new Message(inputText, "user"));
    this.addMessage(new Message(finalResponse, "assistant"));

    return finalResponse;
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
   * Returns the configured system prompt or the default assistant behavior.
   */
  private getEnhancedSystemPrompt(): string {
    return this.systemPrompt ?? "You are a helpful AI assistant.";
  }
}
