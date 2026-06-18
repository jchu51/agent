import { SimpleAgent } from "../src/agents/simple-agent";
import { AgentsLLM } from "../src/core/llm";

const main = async () => {
  const llm = new AgentsLLM();

  const agent = new SimpleAgent({
    name: "TS Assistant",
    llm,
    systemPrompt: "You are a concise and helpful TypeScript agent.",
  });

  const response = await agent.run(
    "What is 12 * 8? Use the calculator tool if useful.",
  );
  console.log(response);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
