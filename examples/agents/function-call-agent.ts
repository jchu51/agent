import { FunctionCallAgent } from "../../src/agents/function-call-agent";
import { LLM } from "../../src/core/llm";
import { CalculatorTool } from "../../src/tools/calculator";
import { ToolRegistry } from "../../src/tools/registry";

async function main(): Promise<void> {
  const llm = new LLM();

  const registry = new ToolRegistry();
  registry.registerTool(new CalculatorTool());

  const agent = new FunctionCallAgent({
    name: "Native Tool Assistant",
    llm,
    systemPrompt:
      "You are a concise assistant. Use tools when they make the answer more reliable.",
    toolRegistry: registry,
  });

  const response = await agent.run("Calculate 12 * 8 + 0.00001 * 10000.");
  console.log(response);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
