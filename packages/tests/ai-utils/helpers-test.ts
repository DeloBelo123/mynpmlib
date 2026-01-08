import { summarize, getLLM, decide, extract, classify } from "../../ai-utils/src";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
import z from "zod/v3";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../.env") });

const llm = getLLM({
    type:"groq",
    apikey: process.env.CHATGROQ_API_KEY!,
})

const data = {

    "meeting": {
      "title": "Product Launch Sync"
    },
    "discussion": [
      {
        "speaker": "CTO",
        "text": "If we launch without fixing onboarding, we risk high churn after the trial."
      },
      {
        "speaker": "Product",
        "text": "The onboarding flow is only 60% complete."
      }
    ]
  }
  


async function main(){
  console.log((await classify({llm,data,classes:["noise", "informational", "needs_decision"] as const})) )
}

main()