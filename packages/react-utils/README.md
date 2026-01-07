# @my/react-utils

Collection of useful React hooks and utilities.

## Installation

```bash
npm install @my/react-utils
```

## Usage

```typescript
import { useToggle, useLocalStorage, GlobalState } from "@my/react-utils"

function MyComponent() {
  const [isOpen, toggle] = useToggle(false)
  const [value, setValue] = useLocalStorage("key", "default")
  
  return (
    <div>
      <button onClick={toggle}>Toggle</button>
      {isOpen && <p>Open!</p>}
    </div>
  )
}
```

## Available Hooks

- `useToggle()` - Boolean toggle hook
- `useLocalStorage()` - LocalStorage hook
- `useInputValue()` - Input value hook
- `useMediaWidth()` - Media width hook
- `useOnlineStatus()` - Online status hook
- `useOnlineListener()` - Online status listener
- `useScrollmation()` - Scroll animation hook
- `useCallStack()` - Call stack hook
- `useTypicalStack()` - Typical stack hook
- `useSendOnlineStatus()` - Send online status hook

## Context Providers

- `GlobalState` - Global state context provider
- `QueryContext` - Query context provider


