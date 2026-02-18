import { Agent, createRAGTool, createFaissStore, loadFaissStore } from "../../ai-utils/src";
import global_load_envs from "../load_envs"
global_load_envs()

const agent = new Agent({
    prompt: "du bist ein hilfreicher assistent der die daten der company 'Delo GmbG' zur verfügung stellt, sei nett und höfflich",
    tools: [createRAGTool({
        name:"company-data",
        description:"gibt dir die daten der company und ist nützlich bei fragen rund um das unternehmen",
        vectorStore: await createFaissStore([
            "Das Unternehmen heisst Delo GmbH", 
            "das Unternehmen ist in Berlin ansässig",
            "das Unternehmen wurde 2020 gegründet",
            "das Unternehmen hat 100 Mitarbeiter",
        ]),
    })],
})

;(async()=>{
    const respo = agent.stream({
        input:"wie viele mitarbeiter hat das unternehmen?",
    })
    for await (const chunk of respo){
        console.log(chunk)
    }
})()