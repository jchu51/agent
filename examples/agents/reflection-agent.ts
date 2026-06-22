import { ReflectionAgent } from "../../src/agents/reflection-agent";
import { LLM } from "../../src/core/llm";
import { CalculatorTool } from "../../src/tools/calculator";
import { ToolRegistry } from "../../src/tools/registry";

async function main() {
  const llm = new LLM();
  const registry = new ToolRegistry();
  registry.registerTool(new CalculatorTool());

  const agent = new ReflectionAgent({
    name: "Reflection Assistant",
    llm,
    toolRegistry: registry,
  });

  const response = await agent.run(
    "A store sells notebooks for $4 each. If you buy 5 or more, you get 15% off the entire order. Maria buys 6 notebooks. How much does she pay? Show your reasoning.",
  );

  console.log("response", response);
  console.log(`Response: ${response}\n`);
  console.log(`Agent Current History: \n`);

  agent.currentHistory.forEach((history: string) => {
    console.log(`History: ${history}\n`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
