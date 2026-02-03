import { SupabaseTable } from "../../supabase-utils/src/server"
import global_load_envs from "../load_envs"
global_load_envs()

interface TestTable {
    id: string
    name: string
    age: number
    email: string
    has_payed: boolean
}

if(!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be set")
}

async function main() {
    const table = new SupabaseTable<TestTable>("testos")
    const row = await table.getRow({name:"Delo"})
    console.log(row.name)

}

main().catch(console.error)