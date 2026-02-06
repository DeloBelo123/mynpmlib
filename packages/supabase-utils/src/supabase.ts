import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * @example CONSTRUCTOR:
 * public tableName:string
    public structure?:T
    private supabase: SupabaseClient
    
    constructor(tableName:string, supabase?: SupabaseClient){
        this.tableName = tableName
        this.supabase = supabase ?? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY! || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    }
 */
export class SupabaseTable<T extends Record<string,any>> {
    public tableName:string
    public structure?:T
    private supabase: SupabaseClient
    
    constructor(tableName:string, supabase?: SupabaseClient){
        this.tableName = tableName
        this.supabase = supabase ?? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY! || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    }
    /**
     * @param rows - die neuen Zeilen die du in die Tabelle einfügen möchtest, als Array von Objekten, wo jedes Objekt eine Zeile ist
     * @returns die inserted data
     */
    async insert(rows:Array<Partial<T>>){
        const { data:insertedData, error } = await this.supabase
            .from(this.tableName)
            .insert(rows)
        if (error) {
            throw new Error(`Error inserting data into ${this.tableName}: ${error.message}`);
        }
        return insertedData;
    }

    // funcitonal overloading
    /**
     * @param columns - die spalten die du abfragen möchtest, standardmäßig ist es "*", also alle spalten,
     * @param where - die filter die du anwenden möchtest was ausgewählt werden soll, standardmäßig ist es ein leeres Array, also keine Filter
     * @param ordered_by - sortierung nach einer spalte (column: spaltenname, descending: true/false)
     * @param limited_to - begrenzt die anzahl der ergebnisse
     * @param first - gibt nur die erste Zeile zurück wenn auf true gesetzt ist, als object, anstatt eines Arrays von Zeilen (standardmäßig ist es false)
     * @returns returned ein array von Objekte, wo jedes Objekt eine Zeile der Tabelle ist, die den optionalen Filtern entspricht, wo die Keys die spaltennamen sind und die Values die Werte der Zeile
     */
    async select({columns , where, ordered_by, limited_to}:{
        columns:Array<keyof T | "*">, 
        where?:Array<{column:keyof T | (string & {}),is:any}>,
        ordered_by?:{column:keyof T | (string & {}), descending:boolean},
        limited_to?:number,
        first?:false
    }): Promise<Array<Record<keyof T,any>>>
    async select({columns , where, ordered_by, limited_to}:{
        columns:Array<keyof T | "*">, 
        where?:Array<{column:keyof T | (string & {}),is:any}>,
        ordered_by?:{column:keyof T | (string & {}), descending:boolean},
        limited_to?:number,
        first:true
    }): Promise<Record<keyof T,any> | null>
    async select({columns , where, ordered_by, limited_to, first = false}:{
        columns:Array<keyof T | "*">, 
        where?:Array<{column:keyof T | (string & {}),is:any}>,
        ordered_by?:{column:keyof T | (string & {}), descending:boolean},
        limited_to?:number,
        first?:boolean
    }): Promise<Array<Record<keyof T,any>> | Record<any,any> | null>
    {
        let columnString = columns.join(",")
        let query = this.supabase.from(this.tableName).select(columnString)
        if (where){
            for ( const {column,is} of where) {
                query = query.eq(column as string,is)
            }
        }
        if (ordered_by){
            query = query.order(ordered_by.column as string, { ascending: !ordered_by.descending })
        }
        if (limited_to){
            query = query.limit(limited_to)
        }
        const { data, error } = await query
        if (error) {
            console.error("Error selecting data:", error);
            throw new Error(`Error selecting data from ${this.tableName}: ${error.message}`);
        }
        if(first){
            if(data && data.length > 0){
                return data[0]
            } else {
                console.warn(`No data found in first mode in table: ${this.tableName}.select(${query})`)
                return null
            }
            
        }
        return data
    }

    /**
     * @param updated - die spalten die du aktualisieren möchtest, als Objekt wo der key der Spaltenname ist und der value der neue Wert
     * @param where - die Filter die genau sagen welche Zeile sich aktualisieren soll, sonst wird jede Zeile aktualisiert!!!
     * @returns die geupdateten Zeilen, also die Zeilen die du aktualisiert hast
     */
    async update({where,update}:{ where:Array<{column:keyof T | (string & {}), is:any}>, update:NestedUpdate<T> }){
        // 1. Objekt flach machen (Dot-Notation für JSON-Properties)
        const flatUpdate = this.flattenNested(update as Record<string, any>);
        
        let query = this.supabase.from(this.tableName).update(flatUpdate)
        for ( const {column,is} of where){
            query = query.eq(column as string,is)
        }
        const { data, error } = await query
        if (error) {
            throw new Error(`Error updating data in ${this.tableName}: ${error.message}`);
        }
        return data;
    }
    /**
     * @param where - die Filter die genau sagen welche Zeile gelöscht werden soll, sonst wird jede Zeile gelöscht!!!
     * @returns garnichts, führt einfach nur eine Löschaktion aus
     */
    async delete({where}:{ where:Array<{column:keyof T, is:any}> }){
        let query = this.supabase.from(this.tableName).delete()
        for ( const {column,is} of where){
            query = query.eq(column as string,is)
        }
        const { data, error } = await query
        if (error) {
            throw new Error(`Error deleting data from ${this.tableName}: ${error.message}`);
        }
        return data;
    }
    /**
     * @param where - die Filter die genau sagen welche Werte in die upsert-Daten eingefügt werden sollen (für .eq() Filter)
     * @param upsert - die Daten die du upserten möchtest, als Objekt wo der key der Spaltenname ist und der value der neue Wert
     * @param onConflict - die Spalte die für den Konflikt-Check verwendet wird (normalerweise Primary Key) - verwendet native Supabase .upsert()
     * @returns die upserteten Zeilen, also die Zeilen die du upsertet hast
     */
    async upsert({where,upsert,onConflict}:{ 
        where:Array<{column:keyof T, is:any}>, 
        upsert:Partial<T>,
        onConflict:keyof T | (string & {})
    }){
        if (!onConflict) {
            throw new Error("upsert requires onConflict parameter");
        }

        // Kombiniere where-Werte mit upsert-Daten für vollständiges Objekt
        const combinedData: Partial<T> = { ...upsert };
        for (const { column, is } of where) {
            combinedData[column as keyof T] = is as T[keyof T];
        }

        // Flatten für verschachtelte Objekte (Dot-Notation)
        const flatData = this.flattenNested(combinedData as Record<string, any>);

        // Native Supabase .upsert() - atomar
        const { data, error } = await this.supabase
            .from(this.tableName)
            .upsert(flatData, {
                onConflict: onConflict as string,
            })
            .select();

        if (error) {
            throw new Error(`Error upserting data in ${this.tableName}: ${error.message}`);
        }

        return data;
    }

    /**
     * diese Funktion gibt alle Zeilen zurück, die den optionalen Filtern entsprechen, wo die Keys die spaltennamen sind und die Values die Werte der Zeile. Spalten in der tabelle von denen die row (key vom object) auf dessen value zugreifen werden returned
     * @param values - die Werte die du abfragen möchtest, als Objekt wo der key der Spaltenname ist und der value der Wert
     * @returns ein Array von Objekten, wo jedes Objekt eine Zeile der Tabelle ist, die den optionalen Filtern entspricht, wo die Keys die spaltennamen sind und die Values die Werte der Zeile
     */
    public async getRows({...values}:Partial<T>){
        return await this.select({
            columns:["*"],
            where:Object.keys(values).map(key => ({column:key as keyof T,is:(values as any)[key]})),
        })
    }

    /**
     * diese Funktion returned eine unique row von den die spalte die bein param die key des obj ist der value dessen keys entspricht.
     * WICHTIG: es kann nur eine row returned werden, wenn anhand des params mehr als ein row oder garkeine kommt WIRD EIN ERROR GEWORFEN! (für custom-fail-handling nutze '.saveGetRow()', da wird bei einem faile-case 'null' returned )
     * IMPORTANT: TIPP: sehe den param als "where"-Filter wie bei der '.select()' function
     * @param values - die Werte die du abfragen möchtest, als Objekt wo der key der Spaltenname ist und der value der Wert
     * @returns die unique row
     */
    public async getRow({...values}:Partial<T>):Promise<T>{
        const row = await this.getRows({...values})
        if(row.length > 1){
            throw new Error("error in '.getRow()': Multiple rows found for values: " + JSON.stringify(values) + ", returning null")
        }
        if(row && row.length === 0){
            throw new Error("error in '.getRow()': No row found for values: " + JSON.stringify(values) + ", returning null")
        }
        return row[0]
    }

    /**
     * diese Funktion returned eine unique row von den die spalte die bein param die key des obj ist der value dessen keys entspricht.
     * WICHTIG: es kann nur eine row returned werden, wenn anhand des params mehr als ein row oder garkeine kommt WIRD NULL RETURNED FÜR CUSTOM-FAIL-HANDLING!
     * TIPP: sehe den param als "where"-Filter wie bei der '.select()' function
     * @param values - die Werte die du abfragen möchtest, als Objekt wo der key der Spaltenname ist und der value der Wert
     * @returns die unique row, oder null wenn keine row gefunden wurde oder mehr als eine row gefunden wurde
     */
    public async saveGetRow({...values}:Partial<T>):Promise<T | null>{
        const row = await this.getRows({...values})
        if(row.length > 1){
            console.error("Multiple rows found for values: " + JSON.stringify(values) + ", returning null")
            return null
        }
        if(row && row.length === 0){
            console.error("No row found for values: " + JSON.stringify(values) + ", returning null")
            return null
        }
        return row[0]
    }

     /**
     * Flatten-Funktion für verschachtelte Objekte (Dot-Notation)
     */
     private flattenNested(obj: Record<string, any>, prefix = ""): Record<string, any> {
        const res: Record<string, any> = {};
        
        for (const key in obj) {
            const val = obj[key];
            const newKey = prefix ? `${prefix}.${key}` : key;
            
            if (val && typeof val === "object" && !Array.isArray(val)) {
                // Rekursiv verschachtelte Objekte flach machen
                Object.assign(res, this.flattenNested(val, newKey));
            } else {
                res[newKey] = val;
            }
        }

        return res;
    }
}

export function selectTable({tableName,possibleTables}:{tableName:string,possibleTables:Array<SupabaseTable<Record<string,any>>>}){
    const table = possibleTables.find(table => table.tableName === tableName)
    if (!table) {
        throw new Error(`Table:'${tableName}' not found in possibleTables`)
    }
    return table
}

/** update: Objekt mit Spaltennamen als Keys, neue Werte als Values. Bei JSON-Spalten: ganzes Objekt ODER nur geänderte Felder. */
type NestedUpdate<T> = {
    [K in keyof T]?: T[K] extends object ? T[K] | { [P in keyof T[K]]?: T[K][P] } : T[K]
}; 