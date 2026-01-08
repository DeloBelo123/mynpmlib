import { getLLM, Chain } from "../../ai-utils/src";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../.env") });

const llm = getLLM({
    type:"groq",
    apikey: process.env.CHATGROQ_API_KEY!,
})

const chain = new Chain({ llm })