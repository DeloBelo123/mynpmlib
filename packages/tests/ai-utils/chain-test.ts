import { getLLM, Chain, createSupabaseVectoreStore, createFaissStore } from "../../ai-utils/src";
import { z } from "zod/v3"
import global_load_envs from "../load_envs"
global_load_envs()

const vectorStore = await createFaissStore(["Ich heisse Delo", "Ich bin 18 Jahre alt", "Ich mag Käse"])
const chain = new Chain({ vectorStore })


async function main(){
    const respo = await chain.invoke({input:"wie heisse ich?"})
    console.log(respo.output)
}
main()