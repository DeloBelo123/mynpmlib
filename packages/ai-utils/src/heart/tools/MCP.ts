import { MultiServerMCPClient } from "../../imports"
import type { OAuthClientProvider } from "../../imports"

/**
 * Deklarative Beschreibung eines MCP-Servers, den ein Agent nutzen soll.
 *
 * @example
 * { name: "hubspot", url: env.HUBSPOT_MCP_URL, auth: new HubSpotMcpOAuthProvider(userId) }
 */
export interface MCPServerConfig {
    /** eindeutiger Name – wird als Tool-Prefix verwendet: `<name>__<tool>` */
    name: string
    /** URL des MCP-Servers (streamable HTTP / SSE) */
    url: string
    /** OAuth-Provider für die Authentifizierung (optional) */
    auth?: OAuthClientProvider
    /** statische Header als Auth-Alternative, z.B. `{ Authorization: "Bearer ..." }` */
    headers?: Record<string, string>
    /**
     * Optionaler Hinweis für den Agent, WOFÜR dieser Server da ist / WANN er zu nutzen ist.
     * Wird – wenn gesetzt – automatisch als System-Prompt-Block injiziert.
     * z.B. "Dein CRM. Nutze für Bewerber/Kontakte aus dem CRM."
     */
    description?: string
}

export type MCPServersInput = MCPServerConfig | MCPServerConfig[]

/**
 * Baut aus einer/mehreren {@link MCPServerConfig}(s) einen MultiServerMCPClient.
 * Gibt `undefined` zurück, wenn keine Server angegeben sind.
 *
 * WICHTIG (Lifecycle): Der Client öffnet beim ersten `getTools()` eine Verbindung,
 * die mit `client.close()` wieder geschlossen werden MUSS. `Agent` und `DeepAgent`
 * übernehmen das automatisch im `finally` von `invoke()`/`stream()` – pro Aufruf
 * wird ein frischer Client gebaut und danach geschlossen.
 */
export function buildMcpClient(servers?: MCPServersInput): MultiServerMCPClient | undefined {
    if (!servers) return undefined
    const list = Array.isArray(servers) ? servers : [servers]
    if (list.length === 0) return undefined

    const mcpServers: Record<string, any> = {}
    for (const server of list) {
        mcpServers[server.name] = {
            url: server.url,
            ...(server.auth ? { authProvider: server.auth } : {}),
            ...(server.headers ? { headers: server.headers } : {}),
        }
    }

    return new MultiServerMCPClient({
        useStandardContentBlocks: true,
        // Prefix mit Servername (z.B. "hubspot__create_contact") → kollisionssicher,
        // wenn mehrere Server oder lokale Tools gleiche Tool-Namen haben. additionalToolNamePrefix
        // bleibt "" (default), damit die Namen kurz bleiben.
        prefixToolNameWithServerName: true,
        mcpServers,
    })
}

/**
 * Baut einen System-Prompt-Block aus den `description`-Feldern der MCP-Server –
 * damit der Agent weiß, wofür welcher Server da ist und wann er ihn nutzen soll.
 * Server ohne `description` werden ausgelassen; gibt `undefined` zurück, wenn
 * kein Server eine description hat (dann wird nichts injiziert).
 */
export function buildMcpPromptBlock(servers?: MCPServersInput): string | undefined {
    if (!servers) return undefined
    const list = Array.isArray(servers) ? servers : [servers]
    const described = list.filter((s) => s.description && s.description.trim().length > 0)
    if (described.length === 0) return undefined

    const lines = described.map((s) => `- ${s.name}: ${s.description}`)
    return `Verfügbare MCP-Server (deren Tools heißen \`<name>__<tool>\`):\n${lines.join("\n")}`
}

export { MultiServerMCPClient }
export type { OAuthClientProvider }
