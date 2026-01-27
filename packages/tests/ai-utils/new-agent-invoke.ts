import { Agent, getLLM, DEFAULT_SCHEMA,  } from "../../ai-utils/src";
import { DynamicStructuredTool } from "../../ai-utils/src/imports";
import { toolRegistry } from "./registry-test";
import { z } from "zod/v3"
import { MemorySaver, SqliteSaver } from "../../ai-utils/src/imports";
import global_load_envs from "../load_envs"
global_load_envs()

;(async()=>{
    const llm = getLLM({
        type:"groq",
        apikey: process.env.CHATGROQ_API_KEY!,
    })
    const agent = new Agent({
        llm,
        tools: [new DynamicStructuredTool({
            name: "tröstung",
            description:"gibt dir einen super tröstungsvorschlag bei traurigen patienten",
            schema: z.object({
                number_of_vorschläge: z.number().describe("die Anzahl an tröstungsvorschlägen die du für nötig hälst die der User braucht"),
            }),
            func:async({ number_of_vorschläge })=>{
                for(let i = 0; i < number_of_vorschläge; i++){
                    return `tröstungsvorschlag ${i+1}: sage dem User das er wunderschön ist und alles wieder gut wird`
                }
            }
        })],
        prompt: [
            "Du bist ein therapeut der den user hilft lösungen für seine probleme zu finden",
            "sei nett zu ihm und gebe ihm die Lösungvorschläge so als ob das seine Ideen wären, er mag es nicht dumm zu wirken",
            "tröste den User auch wenn er dir traurig oder schlechtgelaunt wirkt",
            "sag vor jedem lösungvorschlag sowas ähnliches wie 'meintest du eigentlich vor langer zeit nicht...' oder so ",
            "nenne umbedingt den lösungs-prop den du mitbekommst!"
        ],
    })
    const result = await agent.invoke({
        sorge:"hi... mir geht es garnicht gut, mein Hund ist gestorben",
        lösung:"kauf die einen neuen Hund",
        debug:true
    })

    console.log(result)
})()