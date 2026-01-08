# @my/supabase-utils

Utilities for working with Supabase in Node.js and browser environments.

## Installation

```bash
npm install @my/supabase-utils
```

## Usage

### Client-side

```typescript
import { createSupabaseClient, OAuthLogin, sendSession } from "@my/supabase-utils"

const supabase = createSupabaseClient({
  url: "https://your-project.supabase.co",
  anonKey: "your-anon-key"
})

// OAuth login
await OAuthLogin({ 
  supabase, 
  provider: "google", 
  redirectTo: "http://localhost:3000" 
})
```

### Server-side

```typescript
import { createSupabaseServerClient, SupabaseTable } from "@my/supabase-utils"

const supabase = createSupabaseServerClient({
  url: "https://your-project.supabase.co",
  serviceRoleKey: "your-service-role-key"
})

const usersTable = new SupabaseTable<User>("users", supabase)
const users = await usersTable.select({ columns: ["*"] })
```

## Exports

- `createSupabaseClient()` - Create client-side Supabase client
- `createSupabaseServerClient()` - Create server-side Supabase client
- `SupabaseTable` - Type-safe table wrapper
- `OAuthLogin()` - OAuth authentication
- `sendSession()` - Send session data to backend
- `addUser()` - Add user to table



