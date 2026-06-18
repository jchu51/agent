# Agents

A small TypeScript learning project for building an agent wrapper around
OpenAI-compatible chat APIs.

The goal is to make the moving parts visible:

- `AgentsLLM` wraps the OpenAI SDK.
- `Agent` owns shared agent state such as name, prompt, config, and history.
- `SimpleAgent` turns a user input into chat messages and calls the LLM.
- `Message` stores local conversation history before it is converted to API
  messages.

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

const llm = new AgentsLLM();

const agent = new SimpleAgent({
  name: "TS Assistant",
  llm,
  systemPrompt: "You are a concise and helpful TypeScript agent.",
});

const response = await agent.run("What is 12 * 8?");
console.log(response);
```

Run the included example:

```sh
npm run example:basic
```

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
src/agents/simple-agent.ts
examples/basic.ts
```

## Learning Notes

`AgentOptions` is named as a constructor options object even though `name` and
`llm` are required. In TypeScript projects, `Options` often means "the object
used to configure construction," not "every field is optional."

The `systemPrompt` becomes a Chat Completions `system` message. Conversation
history is stored as `Message` objects and converted into `{ role, content }`
objects before the LLM call.

`SimpleAgent` is intentionally small rather than feature-complete. It is a good
place to experiment with prompt construction, history handling, streaming,
tools, retries, and provider-specific model defaults.
