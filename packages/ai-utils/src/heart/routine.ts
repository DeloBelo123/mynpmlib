import { DeepAgent } from "./deepAgent"
import { Agent } from "./agent"
import { HermesAgent } from "./hermesAgent"
import { z } from "zod"

interface Phase {
    title?: string
    instructions: string
}

export class Routine {
    private phases: Phase[]
    private auditAgent: DeepAgent<any> | undefined
    private routineAgent: DeepAgent
    constructor(agent:DeepAgent, aim?:string){ //mit aim sagst du motto was das allgemeine Ziel ist der routine, wenn es eine aim gibt wird ein audit agent angeschaltet am ende
        if(aim){
            this.auditAgent = new DeepAgent({
                prompt:
                `
                Du bist ein Audit Agent einer Routine, die ein Ziel verfolgt.
                Dein Ziel ist es, dir das Endergebnis der Routine anzugucken und zu sagen ob diese das Ziel des users erreicht hat.
                hier ist das Ziel:
                ${aim}
                `,
                output: z.object({
                    done: z.boolean().describe("guck anhand des aims ob das result der routine der aim entspricht, wenn ja mach true, wenn nein mach false"),
                    problems: z.array(z.object({
                        problem: z.string().describe("ein proble warum es nicht zum aim passt"),
                        how_to_improve: z.string().describe("wie man dieses problem fixxen kann damit es zum aim passt")
                    })).nullable().describe("WICHTIG: nur setzen wenn `done` auf false gesetzt ist. dieser prop dient dazu das wenn der return der routine nicht zum aim passt, die genaun gründe dafür und wie man das fixxen kann da gelegt sind. ")
                })
            })
        }
        this.phases = []
        this.routineAgent = agent
    }
    public phase(p:Phase){
        this.phases.push(p)
        return this
    }

    public async run(input?:any){
        const agentInvoke = input ? 
        `Starte die routine mit diesem input:${input}`
        :
        `starte die routine jetzt mit den phasen`
        let routineResult = await this.routineAgent.invoke({
            input: agentInvoke,
            phases: this.phases
        })
        if(this.auditAgent){
            let auditResult = await this.auditAgent.invoke({
                for_you_to_audit: routineResult
            })
            let iterration = 1
            while(!auditResult.done && iterration <= 3){
                routineResult = await this.routineAgent.invoke({
                    input: `Dein routine lauf hat nicht geklappt, hier die Gründe:
                     ${auditResult.problems}, fixxe den lauf anhand diesen vorschlägen`
                })
                auditResult = await this.auditAgent.invoke({
                    for_you_to_audit: routineResult
                })
                console.log(`iterration nummer: ${iterration}`)
                iterration++
            }
            if(!auditResult.done) throw new Error(`
                bruder, routine ist nur am verkacken selbst nach drei itters.
                hier die gründe: ${auditResult.problems},
                hier endResult: ${routineResult}
            `)
        }
        return routineResult
    }
}
