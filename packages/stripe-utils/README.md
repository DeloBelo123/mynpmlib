# @my/stripe-utils

Utilities for integrating Stripe payments with Supabase.

## Installation

```bash
npm install @my/stripe-utils
```

**Peer Dependencies:**
```bash
npm install @my/supabase-utils next
```

## Usage

### Server-side

```typescript
import { createStripeHandler, StripeHandler } from "@my/stripe-utils"
import { createSupabaseServerClient, SupabaseTable } from "@my/supabase-utils"

const supabase = createSupabaseServerClient({
  url: "https://your-project.supabase.co",
  serviceRoleKey: "your-service-role-key"
})

const usersTable = new SupabaseTable<User>("users", supabase)

const stripeHandler = createStripeHandler({
  secret_key: "sk_test_...",
  webhook_key: "whsec_...",
  dataTable: usersTable,
  products: {
    starter: {
      priceId: "price_...",
      name: "Starter",
      description: "Basic plan"
    }
  }
})

// Create checkout session
const session = await stripeHandler.createCheckoutSession({
  mode: "subscription",
  productKey: "starter",
  successUrl: "https://example.com/success",
  cancelUrl: "https://example.com/cancel",
  supabaseId: "user-id"
})
```

### Client-side

```typescript
import { handleSession, handleBillingPortal } from "@my/stripe-utils"
import { createSupabaseClient } from "@my/supabase-utils"

const supabase = createSupabaseClient({
  url: "https://your-project.supabase.co",
  anonKey: "your-anon-key"
})

// Redirect to checkout
await handleSession({
  stripePublicKey: "pk_test_...",
  supabase,
  backend: "/api/checkout",
  productKey: "starter",
  successUrl: "https://example.com/success",
  cancelUrl: "https://example.com/cancel"
})
```

## Exports

- `StripeHandler` - Main Stripe handler class
- `createStripeHandler()` - Factory function
- `handleSession()` - Client-side checkout handler
- `handleBillingPortal()` - Billing portal handler
- `addStripeID()` - Add Stripe customer ID


