import { ConfigOptions } from "./types";

/**
 * Runtime settings shared by agents.
 *
 * This class gives the rest of the code a stable set of defaults while keeping
 * construction simple for examples and experiments.
 */
export class Config {
  readonly maxIterations: number;
  readonly temperature: number;
  readonly timeoutSeconds: number;
  readonly verbose: boolean;

  /**
   * Creates a config object with sensible defaults.
   */
  constructor(options: ConfigOptions = {}) {
    this.maxIterations = options.maxIterations ?? 5;
    this.temperature = options.temperature ?? 0.7;
    this.timeoutSeconds = options.timeoutSeconds ?? 60;
    this.verbose = options.verbose ?? false;
  }
}
