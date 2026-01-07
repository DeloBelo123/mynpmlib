import { z } from "zod";
export const CreateCheckoutSessionSchema = z.object({
    mode: z.enum(["subscription", "payment", "setup"]).default("subscription"),
    successUrl: z.string().url(),
    cancelUrl: z.string().url(),
    customerEmail: z.string().email().optional(),
    supabaseId: z.string(), // ich so weil ich die sb-session dahin schicke mit der handleSession func
    customerId: z.string().optional(),
    productKey: z.string(),
});
export const CreateUserSchema = z.object({
    email: z.string().email(),
    supabaseId: z.string()
});
export const CreateBillingPortalSchema = z.object({
    supabaseId: z.string(),
    returnUrl: z.string().url()
});
//# sourceMappingURL=stripe_types.js.map