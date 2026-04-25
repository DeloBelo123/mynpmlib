import { SupabaseTable } from "../../supabase-utils/src/table/table"
import global_load_envs from "../load_envs"
global_load_envs()

interface TestTable {
    id: string
    name: string
    age: number
    email: string
    family:{
        son:{
            name: string,
            age: number,
        },
        father:{
            name: string,
            age: number,
        }
    }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url?.trim()) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be set in packages/.env")
}
if (!key?.trim()) {
    throw new Error(
        "NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in packages/.env (exact name). " +
            "Supabase-js needs both URL and anon key; an empty line or a different name (e.g. SUPABASE_ANON_KEY only) triggers 'supabaseKey is required'.",
    )
}

async function main() {
    const table = new SupabaseTable<TestTable>("test", { url, key })
    console.log("start update")
    table.update({
        where: [{ column: "name", is: "John" }],
        mergeJson:{
            family: {
                son:{
                    name:"Gola"
                },
                father:{
                    name:"JojoBojo",
                    age:100
                }
            }
        },
        update:{
            age:234802
        }
    })
    console.log("end update")
}

main().catch(console.error)