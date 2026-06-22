import { PlanAndSolveAgent } from "../../src/agents/plan-and-solve-agent/plan-and-solve-agent";
import { LLM } from "../../src/core/llm";

async function main() {
  const llm = new LLM();

  const agent = new PlanAndSolveAgent({
    name: "plan-and-solve-agent",
    llm,
  });

  const response = await agent.run(
    "A store sells notebooks for $4 each. If you buy 5 or more, you get 15% off the entire order. Maria buys 6 notebooks. How much does she pay?",
  );

  console.log("----Plan Execution History----\n");
  agent.currentHistory.forEach((entry) => {
    console.log(`${entry}\n`);
  });

  console.log("----Response----\n");
  console.log(response);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
