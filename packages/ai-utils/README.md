# @my/ai-utils

Utilities for working with LangChain, AI models, and RAG (Retrieval Augmented Generation).

## Installation

```bash
npm install @my/ai-utils
```

**Peer Dependencies:**
```bash
npm install @my/supabase-utils
```

## Usage

### Basic LLM Usage

```typescript
import { getLLM } from "@my/ai-utils"

const llm = getLLM("groq", {
  chatgroqApiKey: "your-api-key"
})

const response = await llm.invoke("Hello!")
```

### Chain

```typescript
import { Chain } from "@my/ai-utils"
import { getLLM } from "@my/ai-utils"

const llm = getLLM("groq", { chatgroqApiKey: "your-key" })

const chain = new Chain({
  llm,
  prompt: [["system", "You are a helpful assistant"]]
})

const result = await chain.invoke({ message: "Hello!" })
```

### Agent

```typescript
import { Agent } from "@my/ai-utils"
import { getLLM } from "@my/ai-utils"

const llm = getLLM("groq", { chatgroqApiKey: "your-key" })

const agent = new Agent({
  llm,
  tools: [/* your tools */],
  prompt: [["system", "You are a helpful assistant"]]
})

const result = await agent.invoke({ 
  input: "What's the weather?", 
  thread_id: "thread-1" 
})
```

### Memory Chain

```typescript
import { MemoryChain } from "@my/ai-utils"
import { getLLM } from "@my/ai-utils"

const llm = getLLM("groq", { chatgroqApiKey: "your-key" })

const chain = new MemoryChain({
  llm,
  prompt: [["system", "You are a helpful chatbot"]]
})

const result = await chain.invoke({
  input: "Hello!",
  thread_id: "thread-1"
})
```

## Exports

- `getLLM()` - Create LLM instance (Groq, OpenAI, Ollama)
- `Chain` - Basic chain without memory
- `MemoryChain` - Chain with memory support
- `Agent` - Agent with tools and memory
- `Chatbot` - High-level chatbot interface
- `structure()` - Structure output with Zod schema
- `summarize()` - Summarize conversations
- RAG utilities for vector stores



