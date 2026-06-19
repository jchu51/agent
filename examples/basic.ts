import { SimpleAgent } from "../src/agents/simple-agent";
import { AgentsLLM } from "../src/core/llm";
import { CalculatorTool } from "../src/tools/calculator";
import { ToolRegistry } from "../src/tools/registry";

const main = async () => {
  const llm = new AgentsLLM();

  const registry = new ToolRegistry();
  registry.registerTool(new CalculatorTool());

  const agent = new SimpleAgent({
    name: "TS Assistant",
    llm,
    systemPrompt: `You are a concise and helpful TypeScript agent.`,
    toolRegistry: registry,
  });

  const response = await agent.run(
    "What is 12 * 8 + 0.00001 * 10000? Use the calculator tool if useful.",
  );

  console.log(response);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
