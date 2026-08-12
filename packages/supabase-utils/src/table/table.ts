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
     * @param where - die filter die du anwenden möchtest was ausgewählt werden soll, standardmäßig ist es ein leeres Array, also keine Filter.
     *                Pro Element ist `is` der eq-Default; zusätzlich gibt es `gt`/`gte`/`lt`/`lte` für Bereichsfilter.
     *                Mehrere Operatoren am selben Element werden UND-verknüpft (z.B. `{ column:"created_at", gte:a, lt:b }`).
     * @param ordered_by - sortierung nach einer spalte (column: spaltenname, descending: true/false)
     * @param limited_to - begrenzt die anzahl der ergebnisse (nicht zusammen mit `range` benutzbar)
     * @param range - optionaler Ausschnitt für Pagination. Zwei Formen:
     *                `{ size, from }` = Offset (from ist 0-basierter Zeilen-Index, default 0),
     *                `{ size, after }` = Keyset/Cursor (after.value darf für die erste Seite leer bleiben).
     * @param withTotal - zählt zusätzlich die Gesamttreffer (`count: "exact"`, teuer). Nur im Offset-Modus erlaubt.
     * @returns ohne `range` ein Array von Zeilen (leeres Array wenn keine Treffer), mit `range` ein {@link SelectRangeResult}.
     */
    async select<K extends keyof T = keyof T>(
        args: SelectArgs<T, K> & { range: SelectRange<T>; withTotal?: boolean },
    ): Promise<SelectRangeResult<Record<keyof T, any>, T>>;
    async select<K extends keyof T = keyof T>(
        args: SelectArgs<T, K> & { range?: undefined; withTotal?: undefined },
    ): Promise<Array<Record<keyof T, any>>>;
    async select<K extends keyof T = keyof T>({
        columns,
        where,
        ordered_by,
        limited_to,
        range,
        withTotal,
    }: SelectArgs<T, K> & { range?: SelectRange<T>; withTotal?: boolean }): Promise<any> {
        // --- Pfad ohne Pagination: verhält sich exakt wie vorher ---
        if (!range) {
            let query = this.buildQuery(
                columns,
                where,
                ordered_by ? [{ column: ordered_by.column as string, descending: ordered_by.descending }] : undefined,
            );
            if (limited_to) {
                query = query.limit(limited_to);
            }
            const { data, error } = await query;
            if (error) {
                throw new Error(`Error selecting data from ${this.tableName}: ${error.message}`);
            }
            return (data ?? []) as Array<Record<keyof T, any>>;
        }

        if (limited_to !== undefined) {
            throw new Error("select: use either `limited_to` or `range`, not both — `range.size` is the limit.");
        }
        if (!Number.isInteger(range.size) || range.size < 1) {
            throw new Error(`select: range.size must be a positive integer, got ${range.size}.`);
        }

        const isKeyset = "after" in range;
        const descending = ordered_by?.descending ?? false;

        let query: any;
        let from = 0;
        let cursor: CursorRef<T> | undefined;

        if (isKeyset) {
            cursor = range.after;

            // `count` würde MIT dem Cursor-Filter gezählt werden, wäre also "verbleibende Zeilen ab
            // Cursor" statt der Gesamtmenge. Lieber hart abbrechen als eine falsche Zahl liefern.
            if (withTotal) {
                throw new Error(
                    "select: `withTotal` is not supported with keyset pagination — the count would be computed with the cursor filter applied (rows remaining after the cursor), not the total. Use an offset range (`{ size, from }`) if you need a total.",
                );
            }
            if (ordered_by && ordered_by.column !== cursor.column) {
                throw new Error(
                    `Keyset pagination must be ordered by the cursor column ("${String(cursor.column)}"), got "${String(ordered_by.column)}".`,
                );
            }
            this.assertCursorColumnSelected(columns, cursor.column);
            if (cursor.tieBreaker) {
                this.assertCursorColumnSelected(columns, cursor.tieBreaker.column);
            }

            const hasValue = cursor.value !== undefined && cursor.value !== null;
            const tie = cursor.tieBreaker;
            const hasTieValue = tie ? tie.value !== undefined && tie.value !== null : false;
            if (tie && hasValue !== hasTieValue) {
                throw new Error(
                    `Keyset cursor is half-filled: "${String(cursor.column)}" and its tieBreaker "${String(tie.column)}" must both carry a value (paging on) or both be empty (first page).`,
                );
            }

            // Bei zusammengesetztem Cursor muss auch nach dem Tie-Breaker sortiert werden,
            // sonst ist die Reihenfolge innerhalb gleicher Cursor-Werte undefiniert.
            const order = [{ column: cursor.column as string, descending }];
            if (tie) {
                order.push({ column: tie.column as string, descending });
            }
            query = this.buildQuery(columns, where, order);

            // Kein Cursor-Wert = erste Seite: nur sortieren und limitieren, kein lt/gt-Filter.
            if (hasValue) {
                const col = cursor.column as string;
                const op = descending ? "lt" : "gt";
                if (tie && hasTieValue) {
                    // (col, tie) > (v, tv) als PostgREST-Ausdruck:
                    //   col.gt.v OR (col.eq.v AND tie.gt.tv)
                    // Ohne das überspringt ein reines gt/lt alle weiteren Zeilen mit demselben
                    // col-Wert (z.B. Batch-Inserts, die sich ein `now()` teilen).
                    const v = this.encodeFilterValue(cursor.value);
                    query = query.or(
                        `${col}.${op}.${v},and(${col}.eq.${v},${tie.column as string}.${op}.${this.encodeFilterValue(tie.value)})`,
                    );
                } else {
                    query = descending ? query.lt(col, cursor.value) : query.gt(col, cursor.value);
                }
            }
            // eine Zeile mehr holen als angefordert -> hasMore ohne teuren count
            query = query.limit(range.size + 1);
        } else {
            from = range.from ?? 0;
            if (!Number.isInteger(from) || from < 0) {
                throw new Error(`select: range.from must be a non-negative integer, got ${from}.`);
            }
            query = this.buildQuery(
                columns,
                where,
                ordered_by ? [{ column: ordered_by.column as string, descending: ordered_by.descending }] : undefined,
                withTotal ? "exact" : undefined,
            );
            query = query.range(from, from + range.size); // .range() ist inklusiv -> size + 1 Zeilen
        }

        const { data, error, count } = await query;
        if (error) {
            throw new Error(`Error selecting data from ${this.tableName}: ${error.message}`);
        }

        const all = (data ?? []) as Array<Record<keyof T, any>>;
        const hasMore = all.length > range.size;
        const rows = hasMore ? all.slice(0, range.size) : all;

        if (isKeyset) {
            const last = rows.length > 0 ? (rows[rows.length - 1] as Record<string, any>) : undefined;
            const tie = cursor!.tieBreaker;
            return {
                rows,
                size: range.size,
                hasMore,
                nextCursor:
                    hasMore && last
                        ? {
                              column: cursor!.column,
                              value: last[cursor!.column as string],
                              ...(tie
                                  ? { tieBreaker: { column: tie.column, value: last[tie.column as string] } }
                                  : {}),
                          }
                        : null,
            } satisfies SelectRangeResult<Record<keyof T, any>, T>;
        }

        return {
            rows,
            size: range.size,
            hasMore,
            from,
            nextFrom: hasMore ? from + rows.length : null,
            ...(withTotal ? { total: count ?? 0 } : {}),
        } satisfies SelectRangeResult<Record<keyof T, any>, T>;
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
     * @param options - optional: `columns` um nur bestimmte Spalten zu ziehen (default `["*"]` — spart Egress bei fetten JSONB-Spalten),
     *                  `range`/`withTotal`/`ordered_by` für Pagination (siehe {@link SupabaseTable.select}).
     * @returns ein Array von Objekten, wo jedes Objekt eine Zeile der Tabelle ist, die den optionalen Filtern entspricht, wo die Keys die spaltennamen sind und die Values die Werte der Zeile.
     *          Mit `options.range` stattdessen ein {@link SelectRangeResult}.
     */
    public async getRows(
        values: Partial<T>,
        options: GetRowsOptions<T> & { range: SelectRange<T>; withTotal?: boolean },
    ): Promise<SelectRangeResult<Record<keyof T, any>, T>>;
    public async getRows(
        values: Partial<T>,
        options?: GetRowsOptions<T> & { range?: undefined; withTotal?: undefined },
    ): Promise<Array<Record<keyof T, any>>>;
    public async getRows(
        values: Partial<T>,
        options?: GetRowsOptions<T> & { range?: SelectRange<T>; withTotal?: boolean },
    ): Promise<any> {
        const { columns = ["*"], ordered_by, range, withTotal } = options ?? {};
        const where = Object.keys(values).map((key) => ({
            column: key as keyof T,
            is: (values as any)[key],
        }));
        if (range) {
            return this.select({ columns, where, ordered_by, range, withTotal });
        }
        return this.select({ columns, where, ordered_by });
    }

    /**
     * diese Funktion returned eine unique row von den die spalte die bein param die key des obj ist der value dessen keys entspricht.
     * WICHTIG: es kann nur eine row returned werden, wenn anhand des params mehr als ein row oder garkeine kommt WIRD EIN ERROR GEWORFEN! (für custom-fail-handling nutze '.safeGetRow()', da wird bei einem faile-case 'null' returned )
     * IMPORTANT: TIPP: sehe den param als "where"-Filter wie bei der '.select()' function
     * @param values - die Werte die du abfragen möchtest, als Objekt wo der key der Spaltenname ist und der value der Wert
     * @param options - optional: `columns` um nur bestimmte Spalten zu ziehen. Achtung: der Rückgabetyp bleibt `T`,
     *                  tatsächlich enthält die Zeile dann aber nur die angeforderten Spalten.
     * @returns die unique row
     */
    public async getRow(values: Partial<T>, options?: GetRowsOptions<T>): Promise<T> {
        const row = await this.getRows(values, options)
        if(row.length > 1){
            throw new Error("error in '.getRow()': Multiple rows found for values: " + JSON.stringify(values) + ", returning null")
        }
        if(row && row.length === 0){
            throw new Error("error in '.getRow()': No row found for values: " + JSON.stringify(values) + ", returning null")
        }
        return row[0] as T
    }

    /**
     * diese Funktion returned eine unique row von den die spalte die bein param die key des obj ist der value dessen keys entspricht.
     * WICHTIG: es kann nur eine row returned werden, wenn anhand des params mehr als ein row oder garkeine kommt WIRD NULL RETURNED FÜR CUSTOM-FAIL-HANDLING!
     * TIPP: sehe den param als "where"-Filter wie bei der '.select()' function
     * @param values - die Werte die du abfragen möchtest, als Objekt wo der key der Spaltenname ist und der value der Wert
     * @param options - optional: `columns` um nur bestimmte Spalten zu ziehen. Achtung: der Rückgabetyp bleibt `T`,
     *                  tatsächlich enthält die Zeile dann aber nur die angeforderten Spalten.
     * @returns die unique row, oder null wenn keine row gefunden wurde oder mehr als eine row gefunden wurde
     */
    public async safeGetRow(values: Partial<T>, options?: GetRowsOptions<T>): Promise<T | null> {
        const row = await this.getRows(values, options)
        if(row.length > 1){
            return null
        }
        if(row && row.length === 0){
            return null
        }
        return row[0] as T
    }

    /**
     * Läuft über alle Treffer und holt intern in Batches per Keyset-Pagination — der Aufrufer sieht
     * von der Pagination nichts.
     * @param cursorColumn - die Spalte, über die geblättert wird. Muss sortierbar und (zusammen mit
     *                       `tieBreakerColumn`) eindeutig sein.
     * @param tieBreakerColumn - zweite Spalte für den zusammengesetzten Cursor. Setz das immer, wenn
     *                           `cursorColumn` nicht unique ist (z.B. `created_at`), sonst werden
     *                           Zeilen mit identischem Wert übersprungen.
     * @example for await (const user of users.stream({ cursorColumn: "created_at", tieBreakerColumn: "id" })) { ... }
     */
    public async *stream<K extends keyof T = keyof T>({
        columns = ["*"],
        where,
        cursorColumn,
        tieBreakerColumn,
        batchSize = 500,
        descending = false,
    }: {
        columns?: Array<keyof T | "*">;
        where?: Array<WhereFilter<T, K>>;
        cursorColumn: keyof T | (string & {});
        tieBreakerColumn?: keyof T | (string & {});
        batchSize?: number;
        descending?: boolean;
    }): AsyncGenerator<Record<keyof T, any>> {
        // erste Seite = Cursor ohne Wert -> kein lt/gt-Filter, nur sortiert und limitiert
        let after: CursorRef<T> = {
            column: cursorColumn,
            ...(tieBreakerColumn ? { tieBreaker: { column: tieBreakerColumn } } : {}),
        };
        while (true) {
            const batch = await this.select({
                columns,
                where,
                ordered_by: { column: cursorColumn, descending },
                range: { size: batchSize, after },
            });
            for (const row of batch.rows) {
                yield row;
            }
            if (!batch.hasMore || !batch.nextCursor) {
                return;
            }
            after = batch.nextCursor;
        }
    }

    /** Baut Select + Filter + Sortierung; `count` nur setzen wenn die Gesamtzahl wirklich gebraucht wird. */
    private buildQuery<K extends keyof T>(
        columns: Array<keyof T | "*">,
        where?: Array<WhereFilter<T, K>>,
        order?: Array<{ column: string; descending: boolean }>,
        count?: "exact" | "planned" | "estimated",
    ): any {
        let query: any = this.supabase
            .from(this.tableName)
            .select(columns.join(","), count ? { count } : undefined);
        query = this.applyFilters(query, where);
        for (const { column, descending } of order ?? []) {
            query = query.order(column, { ascending: !descending });
        }
        return query;
    }

    /** Hängt die where-Filter an; mehrere Operatoren am selben Element werden UND-verknüpft. */
    private applyFilters<K extends keyof T>(query: any, where?: Array<WhereFilter<T, K>>): any {
        if (!where) {
            return query;
        }
        for (const filter of where) {
            const column = filter.column as string;
            let applied = false;
            if (filter.is !== undefined) {
                // `.eq(col, null)` matcht in PostgREST nicht — dafür gibt es IS NULL.
                query = filter.is === null ? query.is(column, null) : query.eq(column, filter.is);
                applied = true;
            }
            if (filter.gt !== undefined) {
                query = query.gt(column, filter.gt);
                applied = true;
            }
            if (filter.gte !== undefined) {
                query = query.gte(column, filter.gte);
                applied = true;
            }
            if (filter.lt !== undefined) {
                query = query.lt(column, filter.lt);
                applied = true;
            }
            if (filter.lte !== undefined) {
                query = query.lte(column, filter.lte);
                applied = true;
            }
            if (!applied) {
                throw new Error(
                    `where: filter on column "${column}" has no operator; use one of is/gt/gte/lt/lte.`,
                );
            }
        }
        return query;
    }

    /**
     * Der Cursor-Wert wird aus der letzten gelieferten Zeile gelesen — steht die Spalte nicht in
     * `columns`, wäre `nextCursor` still `undefined` und das Blättern würde von vorne beginnen.
     */
    private assertCursorColumnSelected(columns: Array<keyof T | "*">, column: keyof T | (string & {})) {
        if (columns.includes("*") || columns.includes(column as keyof T)) {
            return;
        }
        throw new Error(
            `Keyset pagination needs "${String(column)}" in \`columns\` (the cursor value is read from the last returned row); got [${columns.map(String).join(", ")}].`,
        );
    }

    /** Wert für einen PostgREST-Filter-String (`.or(...)`) — Strings werden gequotet und escaped. */
    private encodeFilterValue(value: unknown): string {
        if (value === null || value === undefined) {
            return "null";
        }
        if (typeof value === "number" || typeof value === "boolean") {
            return String(value);
        }
        const str = value instanceof Date ? value.toISOString() : String(value);
        return `"${str.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
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

export function selectTable<T extends string>(tableName:T,possibleTables:Array<SupabaseTable<Record<string,any>>>){
    const table = possibleTables.find(table => table.tableName === tableName)
    if (!table) {
        throw new Error(`Table:'${tableName}' not found in possibleTables`)
    }
    return table
}

/**
 * Ein where-Element. `is` ist der eq-Default (alte Call-Sites bleiben unverändert gültig),
 * `gt`/`gte`/`lt`/`lte` sind Bereichsfilter. Mehrere Operatoren am selben Element = UND.
 * @example { column: "created_at", gte: rangeStart, lt: rangeEnd }
 */
export type WhereFilter<T, K extends keyof T = keyof T> = {
    column: K | (string & {});
    is?: T[K];
    gt?: T[K];
    gte?: T[K];
    lt?: T[K];
    lte?: T[K];
};

export type SelectArgs<T, K extends keyof T = keyof T> = {
    columns: Array<keyof T | "*">;
    where?: Array<WhereFilter<T, K>>;
    ordered_by?: { column: keyof T | (string & {}); descending: boolean };
    limited_to?: number;
};

export type GetRowsOptions<T> = {
    columns?: Array<keyof T | "*">;
    ordered_by?: { column: keyof T | (string & {}); descending: boolean };
};

/**
 * Startpunkt für Keyset-Pagination. `value` leer lassen = erste Seite (kein Filter, nur Sortierung).
 * `tieBreaker` setzen, wenn `column` nicht eindeutig ist — sonst überspringt der Cursor alle
 * weiteren Zeilen mit demselben Wert (klassisch bei Batch-Inserts, die sich ein `now()` teilen).
 */
export type CursorRef<T> = {
    column: keyof T | (string & {});
    value?: any;
    tieBreaker?: { column: keyof T | (string & {}); value?: any };
};

/** Offset-Ausschnitt: `from` ist ein 0-basierter Zeilen-Index (default 0), nicht eine Seitenzahl. */
export type OffsetRange = { size: number; from?: number };

/** Keyset-Ausschnitt: startet hinter `after` statt an einer Position. */
export type KeysetRange<T> = { size: number; after: CursorRef<T> };

export type SelectRange<T> = OffsetRange | KeysetRange<T>;

export type SelectRangeResult<R, T = any> = {
    rows: R[];
    /** die angeforderte Ausschnittsgröße (rows kann auf der letzten Seite kürzer sein) */
    size: number;
    /** true = es gibt noch Zeilen danach; ermittelt über eine zusätzlich geholte Zeile, ohne count */
    hasMore: boolean;
    /** nur Offset-Modus: wo dieser Ausschnitt begann */
    from?: number;
    /** nur Offset-Modus: `from` für den nächsten Aufruf, oder null am Ende */
    nextFrom?: number | null;
    /** nur Keyset-Modus: direkt wieder als `range.after` einsetzbar, oder null am Ende */
    nextCursor?: CursorRef<T> | null;
    /** nur bei `withTotal: true` (Offset-Modus) */
    total?: number;
};

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
