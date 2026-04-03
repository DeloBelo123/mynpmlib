import { z } from "zod"

export const HubspotTokenResponseSchema = z.object({
    access_token: z.string(),
    refresh_token: z.string().optional(),
    expires_in: z.number().optional(),
    token_type: z.string().optional(),
})

export type HubspotTokenResponse = z.infer<typeof HubspotTokenResponseSchema>

export const HubspotAccessTokenMetadataSchema = z.object({
    hub_id: z.number().optional(),
    user_id: z.number().optional(),
    app_id: z.number().optional(),
    hub_domain: z.string().optional(),
    scopes: z.array(z.string()).optional(),
    token: z.string().optional(),
    user: z.string().optional(),
    hub_id_string: z.string().optional(),
})

export type HubspotAccessTokenMetadata = z.infer<typeof HubspotAccessTokenMetadataSchema>

export type HubspotInit = {
    clientId: string
    redirectUri: string
}