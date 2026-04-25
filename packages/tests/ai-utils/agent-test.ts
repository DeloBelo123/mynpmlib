import { Agent, createRAMVectoreStore, session, SmartCheckpointSaver, createRAGTool, getLLM } from "../../ai-utils/src/index"
import { MemorySaver as RAM, z } from "../../ai-utils/src/imports"
import global_load_envs from "../load_envs"
global_load_envs()

const companyVectorStore = await createRAMVectoreStore([
    `Delo GmbH ist ein Recruiting-Unternehmen aus Hamburg, das sich auf die Vermittlung von Fachkräften in Mittelstand und Tech-Unternehmen spezialisiert hat. Das Unternehmen wurde 2019 gegründet und arbeitet mit Kandidaten und Arbeitgebern in Deutschland, Österreich und der Schweiz.`,
    `Delo GmbH begleitet Kandidaten vom Erstgespräch bis zur Vertragsunterschrift. Der Prozess besteht aus Profilanalyse, Beratung zu passenden Rollen, CV-Feedback, Interview-Vorbereitung, Gehaltsberatung und Unterstützung bei Vertragsfragen.`,
    `Für Kandidaten ist die Zusammenarbeit mit Delo GmbH kostenlos. Die Finanzierung läuft über Partnerunternehmen, die bei erfolgreicher Vermittlung eine Recruiting-Fee zahlen. Kandidaten werden nie ohne Zustimmung bei Unternehmen vorgestellt.`,
    `Delo GmbH legt Wert auf ehrliche Beratung, schnelle Kommunikation und langfristige Karriereentscheidungen. Kandidaten erhalten realistische Einschätzungen zu Gehalt, Rollenanforderungen, Arbeitsort, Unternehmenskultur und Entwicklungsmöglichkeiten.`,
    `Die Hauptbranchen von Delo GmbH sind Industrie, Maschinenbau, SaaS, E-Commerce, Logistik und digitale Dienstleistungen. Typische Rollen sind technische Fachkräfte, Sales-Positionen, Softwareentwicklung, Operations und Führungskräfte im Mittelstand.`
])

const jobsVectorStore = await createRAMVectoreStore([
    `Jobrolle Mechaniker: Standort Hamburg oder Bremen, Vollzeit, unbefristet. Aufgaben sind Wartung, Reparatur und Instandhaltung von Maschinen, Fehlerdiagnose, Dokumentation und Zusammenarbeit mit Produktionsteams. Gehalt 42.000 bis 52.000 Euro brutto pro Jahr. Erfahrung: mindestens 2 Jahre Praxis als Mechaniker, Mechatroniker oder Industriemechaniker. Ausbildung im technischen Bereich erforderlich. Schichtbereitschaft ist von Vorteil, aber nicht immer Pflicht.`,
    `Jobrolle Salesmanager: Standort Berlin, Hamburg oder remote hybrid, Vollzeit, unbefristet. Aufgaben sind Neukundenakquise, Betreuung von Bestandskunden, Produktdemos, CRM-Pflege, Pipeline-Management und Vertragsverhandlungen. Gehalt 55.000 bis 75.000 Euro Fixgehalt plus Provision. Erfahrung: 3 bis 5 Jahre B2B-Sales, idealerweise SaaS oder Recruiting. Sehr gute Deutschkenntnisse, Kommunikationsstärke und Reisebereitschaft innerhalb Deutschlands sind wichtig.`,
    `Jobrolle Backenddev: Standort München, Köln oder remote in Deutschland, Vollzeit, unbefristet. Aufgaben sind Entwicklung von APIs, Datenbankdesign, Cloud-Services, Performance-Optimierung, Testing und Zusammenarbeit mit Frontend und Product. Tech Stack: TypeScript, Node.js, PostgreSQL, Docker, AWS oder Vercel. Gehalt 65.000 bis 90.000 Euro brutto pro Jahr. Erfahrung: mindestens 3 Jahre Backend-Entwicklung, gute Kenntnisse in REST oder GraphQL und sauberem Softwaredesign.`
])

const companyRagTool = createRAGTool({
    vectorStore: companyVectorStore,
    name: "search_company_info",
    description: "Durchsucht Informationen über das Recruiting-Unternehmen Delo GmbH."
})

const jobsRagTool = createRAGTool({
    vectorStore: jobsVectorStore,
    name: "search_job_roles",
    description: "Durchsucht Jobbeschreibungen für Mechaniker, Salesmanager und Backenddev."
})

async function main(){

    const agent = new Agent({
        tools: [companyRagTool, jobsRagTool],
        prompt: `
            du bist ein setter für Delo GmbH, einer Recruiting-Agentur. du wirst die fragen vom kandidaten beantworten,
            nutze dafür je nach dem welche art von frage eines deiner rag-tools. wenn du das tool genutzt hast und 
            die antwort nicht kennst, sei ehrlich und sag dem kandidaten das.
        `,
        memory: new SmartCheckpointSaver(new RAM()),
        llm: getLLM({
            type: "openrouter",
            model:"openai/gpt-5.4-mini"
        })
    })
    
    await session({ streamable: agent })

}

main()