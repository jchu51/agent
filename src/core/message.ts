import { ChatMessage, MessageOptions, MessageRole } from "./types";

/**
 * Stored conversation message.
 *
 * Agents keep `Message` objects in memory because they can include local
 * metadata such as timestamps. Before calling the LLM, messages are converted
 * to the plain `{ role, content }` shape expected by Chat Completions.
 */
export class Message {
  readonly content: string;
  readonly role: MessageRole;
  readonly timestamp: Date;
  readonly metadata: Record<string, unknown>;

  /**
   * Creates a message for the agent's local history.
   */
  constructor(
    content: string,
    role: MessageRole,
    options: MessageOptions = {},
  ) {
    this.content = content;
    this.role = role;
    this.timestamp = new Date();
    this.timestamp = options.timestamp ?? new Date();
    this.metadata = options.metadata ?? {};
  }

  /**
   * Converts this local message into an API-ready chat message.
   */
  toObject(): ChatMessage {
    return {
      role: this.role,
      content: this.content,
    };
  }

  /**
   * Returns a compact readable representation for logs and debugging.
   */
  toString(): string {
    return `[${this.role}] ${this.content}`;
  }
}
