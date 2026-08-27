/**
 * Fehler aller Dateisystem-Operationen dieser Bibliothek.
 *
 * Trägt den Node-Fehlercode, den betroffenen Pfad und die Operation mit, damit
 * der Aufrufer gezielt reagieren kann statt Meldungstexte zu parsen. Der
 * ursprüngliche Fehler hängt als `cause` daran.
 *
 * @example
 * ```ts
 * try {
 *     await cfg.overwrite('{"port":3000}')
 * } catch (e) {
 *     if (e instanceof FsError && e.code === "EACCES") return   // keine Rechte
 *     else throw e
 * }
 * ```
 */
export class FsError extends Error {
    /** Node-Fehlercode wie 'ENOENT', 'EACCES', 'ENOSPC' - wenn vorhanden */
    public code?: string
    /** der betroffene Pfad */
    public path: string
    /** die Operation, z.B. 'overwrite', 'copyDir' */
    public op: string

    constructor(op: string, path: string, message: string, cause?: unknown){
        super(`${message}: '${path}'`, { cause })
        this.name = "FsError"
        this.op = op
        this.path = path
        const c = cause as NodeJS.ErrnoException | undefined
        if(c?.code) this.code = c.code
    }
}

/**
 * Erzeugt einen catch-Handler, der jeden Fehler als {@link FsError} weiterwirft.
 *
 * @internal
 */
export function rethrow(op: string, path: string, message: string): (e: unknown) => never {
    return (e) => { throw new FsError(op, path, message, e) }
}

export interface DirFile {
    /** Pfad relativ zum gelesenen Ordner, z.B. "api/users/route.ts" */
    path: string
    content: string
}

export interface DirReadOptions {
    /** auch Unterordner einbeziehen (Standard: nur die oberste Ebene) */
    recursive?: boolean
    /**
     * Obergrenze pro Datei in Bytes. Grössere Dateien lassen die Operation
     * werfen, statt den Heap zu sprengen. Standard: 50 MB.
     */
    maxFileSize?: number
    /**
     * Relative Pfade, die übersprungen werden - passende Ordner werden gar
     * nicht erst betreten. Standard: nichts. Empfehlung für Projektordner:
     * `[/node_modules/, /\.git/]`.
     */
    ignore?: (string | RegExp)[]
    /**
     * Wie viele Dateien {@link Directory.each} gleichzeitig verarbeitet.
     * Standard 1, also streng nacheinander.
     */
    concurrency?: number
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
 * Input-Typ für new File: erzwingt eine Endung im letzten Segment.
 * Bei einem Pfad ohne Endung steht die Erklärung direkt im TS-Fehler.
 */
export type FilePathInput<S extends string> =
    HasFileExtension<S> extends true
        ? unknown
        : { __error: `'${S}' hat keine Dateiendung - ein File braucht z.B. '${S}.json'` }

