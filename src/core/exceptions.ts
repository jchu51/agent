/**
 * Package-specific error type.
 *
 * Wrapping failures in `AgentsError` makes it easier for callers to distinguish
 * framework errors from lower-level SDK or runtime errors.
 */
export class AgentsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentsError";
  }
}
