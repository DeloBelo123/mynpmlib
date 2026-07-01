/**
 * MCP-Implementierungs-Test für @delofarag/ai-utils
 *
 * Testet gegen den öffentlichen, auth-freien DeepWiki-MCP-Server
 * (https://mcp.deepwiki.com/mcp – Streamable HTTP, no auth).
 *
 * Ausführen (aus dem Repo-Root):
 *   cd packages/ai-utils && npx tsx ../../tests/ai-utils/mcp-test.ts
 *
 * Optional für den End-to-End-Agent-Vergleich: OPENROUTER_API_KEY setzen.
 *
 * Importiert bewusst aus dem GEBAUTEN dist/ (= das, was published wird),
 * nicht aus src/, damit exakt das Release-Artefakt getestet wird.
 */
import { buildMcpClient, type MCPServerConfig } from "../../packages/ai-utils/dist/heart/tools/MCP.js"
import { Agent } from "../../packages/ai-utils/dist/heart/agent.js"
import { getLLM } from "../../packages/ai-utils/dist/helpers/llms.js"

const DEEPWIKI: MCPServerConfig = {
    name: "deepwiki",
    url: "https://mcp.deepwiki.com/mcp",
    description: "Beantwortet Fragen über öffentliche GitHub-Repos (Wiki/Docs).",
}

const ms = (n: number) => `${n.toFixed(0)}ms`

async function timed<T>(label: string, fn: () => Promise<T>): Promise<{ result: T; dur: number }> {
    const t0 = performance.now()
    const result = await fn()
    const dur = performance.now() - t0
    console.log(`   ⏱  ${label}: ${ms(dur)}`)
    return { result, dur }
}

// ── TEST 1: Connectivity + Tool-Loading + Prefixing (kein LLM nötig) ──────────
async function testConnectivity() {
    console.log("\n=== TEST 1: Connectivity (buildMcpClient → getTools → close) ===")
    const client = buildMcpClient(DEEPWIKI)
    if (!client) throw new Error("buildMcpClient gab undefined zurück")

    const { result: tools } = await timed("getTools()  [connect + tools/list]", () => client.getTools())
    console.log(`   ✓ ${tools.length} Tools geladen:`)
    for (const t of tools) console.log(`       • ${t.name}`)

    const prefixed = tools.length > 0 && tools.every((t) => t.name.startsWith("deepwiki__"))
    console.log(`   ${prefixed ? "✓" : "✗"} alle Tools mit 'deepwiki__' geprefixt: ${prefixed}`)

    await timed("close()", () => client.close())
    return { toolCount: tools.length, prefixed }
}

// ── TEST 2: reiner MCP-Overhead pro Aufruf (connect + getTools + close) ───────
async function testLatencyOverhead(iterations = 5) {
    console.log(`\n=== TEST 2: MCP-Overhead-Latenz (${iterations}× connect+getTools+close) ===`)
    const times: number[] = []
    for (let i = 0; i < iterations; i++) {
        const t0 = performance.now()
        const client = buildMcpClient(DEEPWIKI)!
        await client.getTools()
        await client.close()
        const dur = performance.now() - t0
        times.push(dur)
        console.log(`   Lauf ${i + 1}: ${ms(dur)}`)
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length
    const min = Math.min(...times)
    const max = Math.max(...times)
    console.log(`   → min ${ms(min)} | avg ${ms(avg)} | max ${ms(max)}`)
    console.log(`   Das ist der Aufschlag, den Agent.invoke() PRO Aufruf zahlt, wenn mcpServer gesetzt ist.`)
    console.log(`   'Ohne mcpServer' = 0ms dieses Overheads (kein connect/getTools/close).`)
    return { avg, min, max }
}

// ── TEST 3: End-to-End Agent, mit vs. ohne mcpServer (nur mit LLM-Key) ────────
async function testAgentEndToEnd() {
    console.log("\n=== TEST 3: Agent End-to-End (mit vs. ohne mcpServer) ===")
    if (!process.env.OPENROUTER_API_KEY) {
        console.log("   ⚠ OPENROUTER_API_KEY nicht gesetzt → übersprungen (Tests 1+2 validieren die MCP-Logik bereits).")
        return null
    }
    const llm = getLLM({ provider: "openrouter", model: "google/gemini-2.5-flash-lite" })

    const plain = new Agent({ tools: [], llm, prompt: "Antworte in genau einem Wort." })
    const { dur: durPlain } = await timed("invoke OHNE mcpServer", () =>
        plain.invoke({ frage: "Sag 'hallo'." }))

    const withMcp = new Agent({ tools: [], llm, prompt: "Antworte in genau einem Wort.", mcpServer: DEEPWIKI })
    const { dur: durMcp } = await timed("invoke MIT  mcpServer (deepwiki)", () =>
        withMcp.invoke({ frage: "Rufe KEIN Tool auf. Sag 'hallo'." }))

    console.log(`   → MCP-Aufschlag end-to-end (mit − ohne): ${ms(durMcp - durPlain)}`)
    return { durPlain, durMcp }
}

async function main() {
    console.log("🧪 MCP-Test gegen DeepWiki (https://mcp.deepwiki.com/mcp)")
    const t1 = await testConnectivity()
    const t2 = await testLatencyOverhead(5)
    const t3 = await testAgentEndToEnd()

    console.log("\n=== ZUSAMMENFASSUNG ===")
    console.log(`Tools geladen : ${t1.toolCount}`)
    console.log(`Prefixing ok  : ${t1.prefixed}`)
    console.log(`MCP-Overhead  : avg ${ms(t2.avg)}  (min ${ms(t2.min)} / max ${ms(t2.max)})`)
    if (t3) console.log(`Agent invoke  : ohne ${ms(t3.durPlain)} | mit ${ms(t3.durMcp)} | Aufschlag ~${ms(t3.durMcp - t3.durPlain)}`)

    const pass = t1.toolCount > 0 && t1.prefixed
    console.log(`\n${pass ? "✅ PASS – MCP-Implementierung funktioniert" : "❌ FAIL"}`)
    process.exit(pass ? 0 : 1)
}

main().catch((e) => {
    console.error("\n❌ Test fehlgeschlagen:", e)
    process.exit(1)
})


