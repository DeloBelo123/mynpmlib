import { createClient } from "@supabase/supabase-js";
export function createSupabaseServerClient(config) {
    return createClient(config.url, config.serviceRoleKey);
}
export class SupabaseTable {
    tableName;
    structure;
    supabase;
    constructor(tableName, supabase) {
        this.tableName = tableName;
        this.supabase = supabase;
    }
    /**
     * @param rows - die neuen Zeilen die du in die Tabelle einfügen möchtest, als Array von Objekten, wo jedes Objekt eine Zeile ist
     * @returns nichst, fügt eifach die neuen Zeilen in die Tabelle ein
     */
    async insert(rows) {
        const { data: insertedData, error } = await this.supabase
            .from(this.tableName)
            .insert(rows);
        if (error) {
            throw new Error(`Error inserting data into ${this.tableName}: ${error.message}`);
        }
        return insertedData;
    }
    async select({ columns, where, ordered_by, limited_to, first = false }) {
        let columnString = columns.join(",");
        let query = this.supabase.from(this.tableName).select(columnString);
        if (where) {
            for (const { column, is } of where) {
                query = query.eq(column, is);
            }
        }
        if (ordered_by) {
            query = query.order(ordered_by.column, { ascending: !ordered_by.descending });
        }
        if (limited_to) {
            query = query.limit(limited_to);
        }
        const { data, error } = await query;
        if (error) {
            console.error("Error selecting data:", error);
            throw new Error(`Error selecting data from ${this.tableName}: ${error.message}`);
        }
        if (first) {
            if (data && data.length > 0) {
                return data[0];
            }
            else {
                console.warn(`No data found in first mode in table: ${this.tableName}.select(${query})`);
                return null;
            }
        }
        return data;
    }
    /**
     * Flatten-Funktion für verschachtelte Objekte (Dot-Notation)
     */
    flattenNested(obj, prefix = "") {
        const res = {};
        for (const key in obj) {
            const val = obj[key];
            const newKey = prefix ? `${prefix}.${key}` : key;
            if (val && typeof val === "object" && !Array.isArray(val)) {
                // Rekursiv verschachtelte Objekte flach machen
                Object.assign(res, this.flattenNested(val, newKey));
            }
            else {
                res[newKey] = val;
            }
        }
        return res;
    }
    /**
     * @param updated - die spalten die du aktualisieren möchtest, als Objekt wo der key der Spaltenname ist und der value der neue Wert
     * @param where - die Filter die genau sagen welche Zeile sich aktualisieren soll, sonst wird jede Zeile aktualisiert!!!
     * @returns die geupdateten Zeilen, also die Zeilen die du aktualisiert hast
     */
    async update({ where, update }) {
        // 1. Objekt flach machen (Dot-Notation für JSON-Properties)
        const flatUpdate = this.flattenNested(update);
        let query = this.supabase.from(this.tableName).update(flatUpdate);
        for (const { column, is } of where) {
            query = query.eq(column, is);
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
    async delete({ where }) {
        let query = this.supabase.from(this.tableName).delete();
        for (const { column, is } of where) {
            query = query.eq(column, is);
        }
        const { data, error } = await query;
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
    async upsert({ where, upsert, onConflict }) {
        if (!onConflict) {
            throw new Error("upsert requires onConflict parameter");
        }
        // Kombiniere where-Werte mit upsert-Daten für vollständiges Objekt
        const combinedData = { ...upsert };
        for (const { column, is } of where) {
            combinedData[column] = is;
        }
        // Flatten für verschachtelte Objekte (Dot-Notation)
        const flatData = this.flattenNested(combinedData);
        // Native Supabase .upsert() - atomar
        const { data, error } = await this.supabase
            .from(this.tableName)
            .upsert(flatData, {
            onConflict: onConflict,
        })
            .select();
        if (error) {
            throw new Error(`Error upserting data in ${this.tableName}: ${error.message}`);
        }
        return data;
    }
}
export function selectTable({ tableName, possibleTables }) {
    const table = possibleTables.find(table => table.tableName === tableName);
    if (!table) {
        throw new Error(`Table:'${tableName}' not found in possibleTables`);
    }
    return table;
}
//# sourceMappingURL=server.js.map