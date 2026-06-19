# Agents

A small TypeScript learning project for building an agent wrapper around
OpenAI-compatible chat APIs.

The goal is to make the moving parts visible:

- `AgentsLLM` wraps the OpenAI SDK.
- `Agent` owns shared agent state such as name, prompt, config, and history.
- `SimpleAgent` turns a user input into chat messages and calls the LLM.
- `Message` stores local conversation history before it is converted to API
  messages.
- `Tool`, `ToolRegistry`, and `CalculatorTool` demonstrate a custom
  text-based tool loop.

## Why The OpenAI SDK?

This project uses the OpenAI JavaScript SDK as a client for the OpenAI-style
Chat Completions API. The SDK can call OpenAI-compatible providers when you set
the correct `apiKey`, `baseUrl`, and `model`.

For example:

- DeepSeek: `https://api.deepseek.com`
- Ollama: `http://localhost:11434/v1`
- Local/custom server: any OpenAI-compatible endpoint

The SDK package is from OpenAI, but the server it calls is controlled by
`baseUrl`.

## Setup

```sh
npm install
```

Create a `.env` file or export environment variables in your shell.

DeepSeek:

```sh
DEEPSEEK_API_KEY=your_key
```

Ollama:

```sh
OLLAMA_HOST=http://localhost:11434/v1
```

Custom OpenAI-compatible endpoint:

```sh
LLM_API_KEY=your_key
LLM_BASE_URL=https://your-provider.example/v1
LLM_MODEL_ID=your-model
```

Optional shared settings:

```sh
LLM_TIMEOUT=60
```

## Provider Detection

If you do not pass a provider, `AgentsLLM` tries to detect one from environment
variables, API key hints, or the base URL.

Detection order:

1. `DEEPSEEK_API_KEY` -> `deepseek`
2. `OLLAMA_API_KEY` or `OLLAMA_HOST` -> `ollama`
3. API key equal to `ollama` -> `ollama`
4. Base URL containing `api.deepseek.com` -> `deepseek`
5. Localhost or `127.0.0.1` with port `11434` -> `ollama`
6. Other localhost or `127.0.0.1` URL -> `local`
7. Anything else -> `custom`

`custom` means the package does not know the provider name, but it will still
try to use the provided OpenAI-compatible `LLM_API_KEY` and `LLM_BASE_URL`.

## Basic Example

```ts
import { SimpleAgent } from "../src/agents/simple-agent";
import { AgentsLLM } from "../src/core/llm";
import { CalculatorTool } from "../src/tools/calculator";
import { ToolRegistry } from "../src/tools/registry";

const llm = new AgentsLLM();

const registry = new ToolRegistry();
registry.registerTool(new CalculatorTool());

const agent = new SimpleAgent({
  name: "TS Assistant",
  llm,
  systemPrompt: "You are a concise and helpful TypeScript agent.",
  toolRegistry: registry,
});

const response = await agent.run("What is 12 * 8 + 0.00001 * 10000?");
console.log(response);
```

Run the included example:

```sh
npm run example:basic
```

## Custom Tool Calling

The current `SimpleAgent` uses a custom text protocol rather than native OpenAI
tool calling.

When tools are enabled, the agent adds tool instructions to the system prompt:

```txt
Available tools:
- calculator: Execute math calculations...
  Parameters: input (string, required): Math expression to evaluate

Tool call format:
[TOOL_CALL:{tool_name}:{parameters}]
```

The model is expected to respond with text like:

```txt
[TOOL_CALL:calculator:input=12*8+0.00001*10000]
```

Then the agent:

1. Parses the text tool call.
2. Converts parameters based on the tool schema.
3. Runs the matching local TypeScript tool.
4. Sends the tool result back to the model as a normal `user` message.
5. Asks the model to produce the final answer.

This is intentionally simple and visible. The model only knows about tools
because the tool descriptions are placed in the prompt.

See [Calculator Tool Flow](docs/calculator-tool-flow.md) for a diagram of how
the calculator tool is registered, prompted, called, executed, and returned to
the model.

## Native OpenAI Tool Calling

`Tool.toOpenAISchema()` is included for learning and future experiments with
native OpenAI tool calling.

Native tool calling is different from the custom protocol:

```ts
client.chat.completions.create({
  model,
  messages,
  tools: registry.getAllTools().map((tool) => tool.toOpenAISchema()),
});
```

With native tool calling, the model returns structured `tool_calls`, and your
app sends results back with `role: "tool"`. The current `SimpleAgent` does not
use that native path yet.

## Build

```sh
npm run build
```

## Project Shape

```txt
src/core/llm.ts          LLM wrapper and provider detection
src/core/agent.ts        Abstract base agent
src/core/message.ts      In-memory message object
src/core/config.ts       Shared runtime config defaults
src/core/types.ts        Shared TypeScript types
src/core/tool.ts         Base class for local executable tools
src/agents/simple-agent.ts
src/tools/registry.ts    In-memory tool registry
src/tools/calculator.ts  Arithmetic calculator tool
src/tools/function-tool.ts
examples/basic.ts
```

## Learning Notes

`AgentOptions` is named as a constructor options object even though `name` and
`llm` are required. In TypeScript projects, `Options` often means "the object
used to configure construction," not "every field is optional."

The `systemPrompt` becomes a Chat Completions `system` message. Conversation
history is stored as `Message` objects and converted into `{ role, content }`
objects before the LLM call.

`streamRun` currently streams directly from the LLM and does not execute custom
tool calls mid-stream.

Some tool helpers are not used by `SimpleAgent` yet, but are kept intentionally:

- `Tool.toOpenAISchema()` shows how a local tool can become a native OpenAI
  function schema.
- `ToolRegistry.registerFunction()` is a shortcut for wrapping one-input
  functions as tools.
- `globalRegistry` is available for quick experiments, while examples use a
  local registry to keep state explicit.

`SimpleAgent` is intentionally small rather than feature-complete. It is a good
place to experiment with prompt construction, history handling, streaming,
custom tools, native tools, retries, and provider-specific model defaults.
