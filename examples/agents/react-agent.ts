import { ReActAgent } from "../../src/agents/react-agent";
import { LLM } from "../../src/core/llm";
import { CalculatorTool } from "../../src/tools/calculator";
import { ToolRegistry } from "../../src/tools/registry";

async function main() {
  const llm = new LLM();

  const registry = new ToolRegistry();
  registry.registerTool(new CalculatorTool());

  const agent = new ReActAgent({
    llm,
    name: "react-agent",
    toolRegistry: registry,
  });

  const response = await agent.run("what is 5 +10 * 50000 +123 * 0.111 ?");
  console.log("----History----\n");

  console.log(agent.currentHistory);
  console.log("----Response----\n");
  console.log(response);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
