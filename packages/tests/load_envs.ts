import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

export default function global_load_envs(){
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    dotenv.config({ path: resolve(__dirname, "../.env") })
}