import { SupabaseClient } from "@supabase/supabase-js";
export type SupabaseServerConfig = {
    url: string;
    serviceRoleKey: string;
};
export declare function createSupabaseServerClient(config: SupabaseServerConfig): SupabaseClient;
type NestedUpdate<T> = {
    [K in keyof T]?: T[K] extends object ? T[K] | {
        [P in keyof T[K]]?: T[K][P];
    } : T[K];
};
export declare class SupabaseTable<T extends Record<string, any>> {
    tableName: string;
    structure?: T;
    private supabase;
    constructor(tableName: string, supabase: SupabaseClient);
    /**
     * @param rows - die neuen Zeilen die du in die Tabelle einfügen möchtest, als Array von Objekten, wo jedes Objekt eine Zeile ist
     * @returns nichst, fügt eifach die neuen Zeilen in die Tabelle ein
     */
    insert(rows: Array<Partial<T>>): Promise<null>;
    /**
     * @param columns - die spalten die du abfragen möchtest, standardmäßig ist es "*", also alle spalten,
     * @param where - die filter die du anwenden möchtest was ausgewählt werden soll, standardmäßig ist es ein leeres Array, also keine Filter
     * @param ordered_by - sortierung nach einer spalte (column: spaltenname, descending: true/false)
     * @param limited_to - begrenzt die anzahl der ergebnisse
     * @returns returned ein array von Objekte, wo jedes Objekt eine Zeile der Tabelle ist, die den optionalen Filtern entspricht, wo die Keys die spaltennamen sind und die Values die Werte der Zeile
     */
    select({ columns, where, ordered_by, limited_to }: {
        columns: Array<keyof T | "*">;
        where?: Array<{
            column: keyof T | (string & {});
            is: string | number | boolean | Date | null | undefined;
        }>;
        ordered_by?: {
            column: keyof T | (string & {});
            descending: boolean;
        };
        limited_to?: number;
        first?: false;
    }): Promise<Array<Record<keyof T, any>>>;
    select({ columns, where, ordered_by, limited_to }: {
        columns: Array<keyof T | "*">;
        where?: Array<{
            column: keyof T | (string & {});
            is: string | number | boolean | Date | null | undefined;
        }>;
        ordered_by?: {
            column: keyof T | (string & {});
            descending: boolean;
        };
        limited_to?: number;
        first: true;
    }): Promise<Record<keyof T, any> | null>;
    /**
     * Flatten-Funktion für verschachtelte Objekte (Dot-Notation)
     */
    private flattenNested;
    /**
     * @param updated - die spalten die du aktualisieren möchtest, als Objekt wo der key der Spaltenname ist und der value der neue Wert
     * @param where - die Filter die genau sagen welche Zeile sich aktualisieren soll, sonst wird jede Zeile aktualisiert!!!
     * @returns die geupdateten Zeilen, also die Zeilen die du aktualisiert hast
     */
    update({ where, update }: {
        where: Array<{
            column: keyof T | (string & {});
            is: string | number | boolean | Date | null | undefined;
        }>;
        update: NestedUpdate<T>;
    }): Promise<null>;
    /**
     * @param where - die Filter die genau sagen welche Zeile gelöscht werden soll, sonst wird jede Zeile gelöscht!!!
     * @returns garnichts, führt einfach nur eine Löschaktion aus
     */
    delete({ where }: {
        where: Array<{
            column: keyof T;
            is: string | number | boolean | Date | null | undefined;
        }>;
    }): Promise<null>;
    /**
     * @param where - die Filter die genau sagen welche Werte in die upsert-Daten eingefügt werden sollen (für .eq() Filter)
     * @param upsert - die Daten die du upserten möchtest, als Objekt wo der key der Spaltenname ist und der value der neue Wert
     * @param onConflict - die Spalte die für den Konflikt-Check verwendet wird (normalerweise Primary Key) - verwendet native Supabase .upsert()
     * @returns die upserteten Zeilen, also die Zeilen die du upsertet hast
     */
    upsert({ where, upsert, onConflict }: {
        where: Array<{
            column: keyof T;
            is: string | number | boolean | Date | null | undefined;
        }>;
        upsert: Partial<T>;
        onConflict: keyof T | (string & {});
    }): Promise<any[]>;
}
export declare function selectTable({ tableName, possibleTables }: {
    tableName: string;
    possibleTables: Array<SupabaseTable<Record<string, any>>>;
}): SupabaseTable<Record<string, any>>;
export {};
//# sourceMappingURL=server.d.ts.map