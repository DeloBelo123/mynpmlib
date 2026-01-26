import { SupabaseTable } from "./server";
import { UUID } from "crypto";

export class SupabaseRows<T extends Record<string,any>>{
    public fromTable:SupabaseTable<T>
    public identifiers:Record<keyof T, any>
    public rows:Array<T>

    private constructor(fromTable:SupabaseTable<T>,rows:Array<T>,{...identifiers}:Record<keyof T, any>){
        this.fromTable = fromTable
        this.identifiers = identifiers
        this.rows = rows
    }

    public static async load<T extends Record<string,any>>(fromTable:SupabaseTable<T>,{...identifiers}:Record<keyof T, any>){
        const rows = await fromTable.select({
            columns:Object.keys(identifiers) as Array<keyof T>,
            where:Object.keys(identifiers).map(key => ({column:key as keyof T,is:identifiers[key as keyof T]}))
        })
        return new SupabaseRows(fromTable,rows,identifiers)
    }

    public async get():Promise<Array<T>>{
        return this.rows
    }
}

type KeysWithUUID<T> = {
    [K in keyof T]: T[K] extends UUID ? K : never
  }[keyof T]

  type ExactlyOneUUID<T> = {
    [K in KeysWithUUID<T>]: (
      { [P in K]: T[P] } &
      { [P in Exclude<KeysWithUUID<T>, K>]?: never }
    )
  }[KeysWithUUID<T>]
  
export class User<T extends Record<string,any>>{
    public fromTable:SupabaseTable<T>
    public identifier:ExactlyOneUUID<T>
    public row:T | null

    private constructor(fromTable:SupabaseTable<T>,row:T | null,{...identifier}:ExactlyOneUUID<T>){
        this.fromTable = fromTable
        this.identifier = identifier
        this.row = row
    }

    public static async load<T extends Record<string,any>>(fromTable:SupabaseTable<T>,{...identifier}:ExactlyOneUUID<T>){
        const rows = await fromTable.select({
            columns:Object.keys(identifier) as Array<keyof T>,
            where:Object.keys(identifier).map(key => ({column:key as keyof T,is:(identifier as any)[key]}))
        })
        if(!rows || rows.length === 0){
            console.error("No row found for identifier: " + JSON.stringify(identifier) + ", somit wurde auch kein User erstellt!")
            return 
        }
        return new User(fromTable,rows[0],identifier)
    }

    public get<K extends keyof T>(prop:K):T[K]{
        if(!this.row) throw new Error("No row found for identifier: " + JSON.stringify(this.identifier) + ", somit wurde auch kein User erstellt und keine konnte auch geupdated werden!!")
        return this.row[prop]
    }

    public async update<K extends keyof T>(prop:K,value:T[K]){
        if(!this.row) throw new Error("No row found for identifier: " + JSON.stringify(this.identifier) + ", somit wurde auch kein User erstellt und keine konnte auch geupdated werden!!")
        this.row[prop] = value
        return this.row
    }
}

// test

interface Table {
    id:UUID,
    name:string,
    age:number,
    isAdmin:boolean,
    createdAt:Date,
    payed:boolean,
    tier: "free" | "pro" | "enterprise",
}

const table = new SupabaseTable<Table>("test")

const user = await User.load(table,{
    id:crypto.randomUUID()
})

user?.update("name",123)