# @my/base-utils

Utility functions for Node.js projects.

## Installation

```bash
npm install @my/base-utils
```

## Usage

```typescript
import { input } from "@my/base-utils"

// CLI input
const answer = await input("Enter your name: ")
console.log(`Hello, ${answer}!`)
```

## Exports

- `input()` - Read user input from CLI
- File utilities
- Pino logger utilities
- Stack log utilities


