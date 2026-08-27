export interface DirFile {
    /** Pfad relativ zum gelesenen Ordner, z.B. "api/users/route.ts" */
    path: string
    content: string
}

export interface DirReadOptions {
    /** auch Unterordner einbeziehen (Standard: nur die oberste Ebene) */
    recursive?: boolean
}

/**
 * true, wenn das LETZTE Pfad-Segment eine Dateiendung hat.
 * "a/b/c.json" -> true | "a/b/c" -> false | "a.b/c" -> false | "a/b." -> false
 * Ein dynamischer string (kein Literal) wird durchgelassen, weil er zur
 * Compile-Zeit nicht prüfbar ist.
 */
export type HasFileExtension<S extends string> =
    string extends S
        ? true
        : S extends `${string}/${infer Rest}`
            ? HasFileExtension<Rest>
            : S extends `${string}\\${infer Rest}`
                ? HasFileExtension<Rest>
                : S extends `${string}.${infer Ext}`
                    ? Ext extends `${string}.${string}`
                        ? HasFileExtension<Ext>
                        : Ext extends "" ? false : true
                    : false

/**
 * Input-Typ für new FilePath: erzwingt eine Endung im letzten Segment.
 * Bei einem Pfad ohne Endung steht die Erklaerung direkt im TS-Fehler.
 */
export type FilePathInput<S extends string> =
    HasFileExtension<S> extends true
        ? unknown
        : { __error: `'${S}' hat keine Dateiendung - ein FilePath braucht z.B. '${S}.json'` }

export type NonNullable = {}