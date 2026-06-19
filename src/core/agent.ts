import { Config } from "./config";
import { LLM } from "./llm";
import { Message } from "./message";
import { AgentOptions } from "./types";

/**
 * Base class for all agents.
 *
 * An agent combines an LLM client, a system prompt, runtime config, and an
 * in-memory message history. Subclasses decide how to turn user input into LLM
 * calls by implementing `run`.
 */
export abstract class Agent {
  readonly name: string;
  readonly llm: LLM;
  readonly systemPrompt?: string;
  readonly config: Config;
  protected history: Message[] = [];

  /**
   * Creates a new agent from required dependencies and optional behavior
   * settings.
   */
  constructor(options: AgentOptions) {
    this.name = options.name;
    this.llm = options.llm;
    this.systemPrompt = options.systemPrompt;
    this.config = options.config ?? new Config();
  }

  /**
   * Runs the agent for one user input.
   *
   * Subclasses own the prompting strategy, tool use, and history updates.
   */
  abstract run(
    inputText: string,
    option?: Record<string, unknown>,
  ): Promise<string>;

  /**
   * Adds a message to the in-memory conversation history.
   */
  addMessage(message: Message): void {
    this.history.push(message);
  }

  /**
   * Removes all stored conversation history.
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Returns the current in-memory history.
   */
  getHistory(): Message[] {
    return this.history;
  }

  /**
   * Returns a short debug label for the agent.
   */
  toString(): string {
    return `Agent(name=${this.name}, provider=${this.llm.provider})`;
  }
}
