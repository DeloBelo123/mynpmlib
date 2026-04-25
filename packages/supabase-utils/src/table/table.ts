import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * CONSTRUCTOR:
 * @example 
 *  public tableName:string
    public structure?:T
    private supabase: SupabaseClient

    constructor(tableName:string, { url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! }:{ url?:string, key?:string } = {}){
        this.tableName = tableName
        this.supabase = createClient(url, key) // per default immer anon-key, wenn du sercret-key will überschreib einfach key-prop
    }
 */
export class SupabaseTable<T extends Record<string,any>> {
    public tableName:string
    public structure?:T
    private supabase: SupabaseClient
    
    constructor(tableName:string, { url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! }:{ url?:string, key?:string } = {}){
        this.tableName = tableName
        this.supabase = createClient(url, key)
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

    /**
     * @param columns - die spalten die du abfragen möchtest, standardmäßig ist es "*", also alle spalten,
     * @param where - die filter die du anwenden möchtest was ausgewählt werden soll, standardmäßig ist es ein leeres Array, also keine Filter
     * @param ordered_by - sortierung nach einer spalte (column: spaltenname, descending: true/false)
     * @param limited_to - begrenzt die anzahl der ergebnisse
     * @returns Array von Zeilen; leeres Array wenn keine Treffer (oder Supabase liefert null).
     */
    async select<K extends keyof T>({
        columns,
        where,
        ordered_by,
        limited_to,
    }: {
        columns: Array<keyof T | "*">;
        where?: Array<{ column: K; is: T[K] }>;
        ordered_by?: { column: keyof T | (string & {}); descending: boolean };
        limited_to?: number;
    }): Promise<Array<Record<keyof T, any>>> {
        let columnString = columns.join(",");
        let query = this.supabase.from(this.tableName).select(columnString);
        if (where) {
            for (const { column, is } of where) {
                query = query.eq(column as string, is);
            }
        }
        if (ordered_by) {
            query = query.order(ordered_by.column as string, { ascending: !ordered_by.descending });
        }
        if (limited_to) {
            query = query.limit(limited_to);
        }
        const { data, error } = await query;
        if (error) {
            console.error("Error selecting data:", error);
            throw new Error(`Error selecting data from ${this.tableName}: ${error.message}`);
        }
        return (data ?? []) as Array<Record<keyof T, any>>;
    }

    /**
     * @param update - Spalten ersetzen (bei JSON/JSONB: Wert = komplettes neues Objekt).
     * @param mergeJson - Optional: nur für genau eine Trefferzeile (where). Deep-Merge in die DB-Werte dieser Spalten (JSONB-Teil-Updates). Wenn es kein objekt in diesem col gibt, wird einfach das zu mergende objekt wie beim 'update'-prop hinzugefügt. props die vorher nicht im objekt waren werden einfach dem objekt hinzugefügt
     * @param where - Filter; bei mergeJson muss genau eine Zeile matchen.
     */
    async update<K extends keyof T>({
        where,
        update,
        mergeJson,
    }: {
        where: Array<{ column: K | (string & {}); is: T[K] }>;
        update?: Partial<T>;
        mergeJson?: MergeJsonPatch<T>;
    }) {
        const mergeKeys = mergeJson
            ? (Object.keys(mergeJson) as Array<keyof T>).filter((k) => mergeJson[k] !== undefined)
            : [];

        for (const k of mergeKeys) {
            if (update?.[k] !== undefined) {
                throw new Error(
                    `Column "${String(k)}" cannot appear in both update and mergeJson; use only mergeJson for partial JSON or only update to replace.`,
                );
            }
        }

        let payload: Record<string, any> = { ...update };

        if (mergeKeys.length > 0) {
            const rows = await this.select({
                columns: mergeKeys as Array<keyof T | "*">,
                where,
                limited_to: 2,
            });
            if (!rows || rows.length === 0) {
                throw new Error(
                    `mergeJson: no row matched the where filter on ${this.tableName}; nothing to merge.`,
                );
            }
            if (rows.length > 1) {
                throw new Error(
                    `mergeJson requires exactly one matching row; got ${rows.length}. Narrow your where filter or update rows in a loop.`,
                );
            }
            const row = rows[0] as Record<string, any>;
            for (const key of mergeKeys) {
                const patch = mergeJson![key] as Record<string, any>;
                const existing = row[key as string];
                const base =
                    existing !== null &&
                    existing !== undefined &&
                    typeof existing === "object" &&
                    !Array.isArray(existing)
                        ? existing
                        : {};
                payload[key as string] = this.deepMergeJson(base, patch);
            }
        }

        let query = this.supabase.from(this.tableName).update(payload);
        for (const { column, is } of where) {
            query = query.eq(column as string, is);
        }
        const { data, error } = await query;
        if (error) {
            throw new Error(`Error updating data in ${this.tableName}: ${error.message}`);
        }
        return data;
    }
    /**
     * @param where - die Filter die genau sagen welche Zeile gelöscht werden soll, sonst wird jede Zeile gelöscht!!!
     * @returns garnichts, führt einfach nur eine Löschaktion aus
     */
    async delete<K extends keyof T>({where}:{ where:Array<{column:K, is:T[K]}> }){
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
    async upsert<K extends keyof T>({where,upsert,onConflict}:{ 
        where:Array<{column:K, is:T[K]}>, 
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

        // Native Supabase .upsert() - atomar (JSONB-Spalten = kompletter Wert pro Key, kein Dot-Flatten)
        const { data, error } = await this.supabase
            .from(this.tableName)
            .upsert(combinedData as Record<string, any>, {
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
     * WICHTIG: es kann nur eine row returned werden, wenn anhand des params mehr als ein row oder garkeine kommt WIRD EIN ERROR GEWORFEN! (für custom-fail-handling nutze '.safeGetRow()', da wird bei einem faile-case 'null' returned )
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
    public async safeGetRow({...values}:Partial<T>):Promise<T | null>{
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

    /** Deep merge für JSON-Objekte (Arrays werden ersetzt, nicht per Index gemerged). */
    private deepMergeJson(base: Record<string, any>, patch: Record<string, any>): Record<string, any> {
        const out: Record<string, any> = { ...base };
        for (const key of Object.keys(patch)) {
            const pv = patch[key];
            const bv = base[key];
            if (
                pv !== null &&
                typeof pv === "object" &&
                !Array.isArray(pv) &&
                bv !== null &&
                typeof bv === "object" &&
                !Array.isArray(bv)
            ) {
                out[key] = this.deepMergeJson(bv as Record<string, any>, pv as Record<string, any>);
            } else {
                out[key] = pv;
            }
        }
        return out;
    }
}

export function selectTable({tableName,possibleTables}:{tableName:string,possibleTables:Array<SupabaseTable<Record<string,any>>>}){
    const table = possibleTables.find(table => table.tableName === tableName)
    if (!table) {
        throw new Error(`Table:'${tableName}' not found in possibleTables`)
    }
    return table
}

/** Rekursives Partial für verschachtelte JSON/JSONB-Felder (nur Keys aus T). */
export type DeepPartial<T> = T extends
    | string
    | number
    | bigint
    | boolean
    | symbol
    | undefined
    | null
    ? T
    : T extends Date
      ? T
      : T extends (...args: unknown[]) => unknown
        ? T
        : T extends ReadonlyArray<infer U>
          ? ReadonlyArray<DeepPartial<U>>
          : T extends object
            ? { [K in keyof T]?: DeepPartial<T[K]> }
            : T;

/** Patch-Form für `.update({ mergeJson })`: pro Spalte optional, innen tiefe Keys von T[K]. */
export type MergeJsonPatch<T> = {
    [K in keyof T]?: DeepPartial<T[K]>;
};




