# Calculator Tool Flow

This diagram shows how the custom text-based tool loop works for
`CalculatorTool`.

```mermaid
flowchart TB
  subgraph Setup["Setup: make the tool visible to the agent"]
    A["CalculatorTool"]
    B["getParameters<br/>input: string"]
    C["ToolRegistry"]
    D["SimpleAgent"]
    E["Enhanced system prompt"]

    A --> B
    B --> C
    C --> D
    D --> E
  end

  subgraph ModelTurn["Model turn: the LLM chooses the tool"]
    F["User asks<br/>calculate 7 - 2 + 5 - 10"]
    G["LLM reads prompt<br/>tools + format"]
    H["LLM writes<br/>TOOL_CALL"]

    F --> G
    E --> G
    G --> H
  end

  subgraph AppExecution["App execution: TypeScript runs the tool"]
    I["parseToolCalls<br/>tool name + raw params"]
    J["parseToolParameters<br/>{ input: expression }"]
    K["executeToolCall"]
    L["CalculatorTool.run"]
    M["Tool result<br/>0"]

    H --> I
    I --> J
    J --> K
    K --> L
    L --> M
  end

  subgraph FinalAnswer["Final answer"]
    N["Agent sends result<br/>as user message"]
    O["LLM answers<br/>7 - 2 + 5 - 10 = 0"]

    M --> N
    N --> O
  end
```

The setup path is:

```txt
CalculatorTool -> ToolRegistry -> SimpleAgent -> system prompt -> LLM
```

The runtime path is:

```txt
user text -> LLM tool-call text -> parser -> local tool -> tool result -> final answer
```

In this custom approach, the model only knows about the calculator because
`SimpleAgent` writes the tool name, description, parameters, and call format into
the system prompt.
