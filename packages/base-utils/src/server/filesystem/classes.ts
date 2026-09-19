import * as fs from 'node:fs/promises'
import * as pa from 'path'
import type { DirFile, DirReadOptions, FilePathInput } from './types.js'
import { FsError, rethrow } from './types.js'
import {
    MAX_FILE_SIZE,
    addToFile,
    copyDir,
    copyFile,
    createDir,
    createFile,
    deleteDir,
    dirExists,
    fileExist,
    isInside,
    listDir,
    readDir,
    readFile,
    overwriteFile,
    readFileLines,
    removeFile,
    toFileContent,
} from './funcs.js'

/**
 * Erlaubt es, den Unterpfad wegzulassen und direkt die Optionen zu übergeben:
 * `read({ recursive: true })` statt `read(undefined, { recursive: true })`.
 */
function dirArgs(subpath?: string | DirReadOptions, options: DirReadOptions = {}): [string | undefined, DirReadOptions] {
    return typeof subpath === "object" && subpath !== null ? [undefined, subpath] : [subpath, options]
}

/**
 * Ein Ordner als abgeschlossener Arbeitsbereich.
 *
 * Jeder Pfad, den du an eine Methode gibst, wird relativ zu diesem Ordner
 * aufgelöst und muss **innerhalb** davon liegen - sonst fliegt ein
 * {@link FsError}. Damit kann nichts außerhalb gelesen oder geschrieben werden.
 *
 * Der Schutz greift auch gegen Symlinks, die aus dem Ordner herausführen: bei
 * jedem tatsächlichen Zugriff wird der echte Pfad aufgelöst und erneut geprüft.
 * Was er **nicht** abfängt, ist ein Symlink, der zwischen Prüfung und Zugriff
 * ausgetauscht wird (TOCTOU) - dagegen schützt die Bibliothek nicht.
 *
 * Der Ordner selbst wird erst beim ersten Zugriff angelegt, nicht schon im
 * Konstruktor.
 *
 * @example
 * ```ts
 * const src = new Directory("src/app")
 * const route = src.file("api/users/route.ts")  // File, garantiert innerhalb
 * await route.overwrite("export function GET(){}")
 *
 * const pfade = (await src.read({ recursive: true })).map(f => f.path)
 * ```
 */
export class Directory {
    /** Name des Ordners, also das letzte Pfad-Segment */
    public name: string
    /** der Pfad, wie er übergeben wurde */
    public path: string
    /** läuft beim ersten Zugriff an, nicht schon im Konstruktor */
    private ready: Promise<void> | null

    /**
     * Öffnet einen Ordner als abgeschlossenen Arbeitsbereich.
     *
     * Der Konstruktor fasst das Dateisystem **nicht** an - angelegt wird der
     * Ordner erst beim ersten Zugriff, samt aller fehlenden Zwischenordner.
     *
     * @param path Pfad zum Ordner, relativ zum Arbeitsverzeichnis
     * @example
     * ```ts
     * const src = new Directory("src/app")
     * ```
     */
    constructor(path:string){
        this.path = path
        this.ready = null
        this.name = pa.basename(pa.resolve(path)) || pa.resolve(path)
    }

    /**
     * Stellt sicher, dass der Ordner existiert.
     *
     * Läuft pro Instanz nur einmal, weil auf ein gemerktes Promise gewartet
     * wird. Scheitert das Anlegen, wird das Promise verworfen - sonst würde
     * jeder spätere Aufruf denselben alten Fehler werfen, auch wenn die
     * Ursache längst behoben ist.
     *
     * @throws {FsError} wenn der Ordner nicht angelegt werden kann
     * @example
     * ```ts
     * await this.__init()   // am Anfang jeder öffentlichen Methode
     * ```
     */
    private async __init(): Promise<void> {
        if(!this.ready) this.ready = createDir(this.path)
        try { await this.ready }
        catch(e){ this.ready = null; throw e }
    }

    /**
     * Löst einen Unterpfad gegen den Ordner auf und stellt sicher, dass er
     * den Ordner nicht verlässt.
     *
     * Rein textuell: `..` ist nach dem Auflösen bereits verrechnet und wird
     * damit abgefangen. Symlinks sieht diese Prüfung nicht - dafür gibt es
     * {@link Directory.resolveReal}.
     *
     * @param subpath Pfad relativ zum Ordner, leer meint den Ordner selbst
     * @returns der absolute Pfad innerhalb des Ordners
     * @throws {FsError} wenn der Pfad außerhalb liegt
     * @example
     * ```ts
     * this.resolve("api/route.ts")   // -> /abs/pfad/api/route.ts
     * this.resolve("../geheim.txt")  // wirft
     * ```
     */
    private resolve(subpath: string = ""): string {
        const root = pa.resolve(this.path)
        const target = pa.resolve(root, subpath)
        if(!isInside(root, target)){
            throw new FsError("resolve", subpath, `Pfad liegt außerhalb von '${this.path}'`)
        }
        return target
    }

    /**
     * Wie {@link Directory.resolve}, löst zusätzlich Symlinks auf.
     *
     * Ein Symlink innerhalb des Ordners, der nach draußen zeigt, besteht die
     * rein textuelle Prüfung - erst der echte Pfad verrät ihn. Existiert das
     * Ziel noch nicht, wird der Elternordner aufgelöst und der Name angehängt.
     *
     * @param subpath Pfad relativ zum Ordner
     * @returns der absolute Pfad innerhalb des Ordners
     * @throws {FsError} wenn der Pfad den Ordner verlässt
     * @example
     * ```ts
     * await this.resolveReal("api/route.ts")
     * ```
     */
    private async resolveReal(subpath: string = ""): Promise<string> {
        const target = this.resolve(subpath)
        const rootLex = pa.resolve(this.path)
        const rootReal = await fs.realpath(rootLex).catch(() => rootLex)
        const targetReal = await fs.realpath(target).catch(async () => {
            const parentReal = await fs.realpath(pa.dirname(target)).catch(() => null)
            return parentReal ? pa.join(parentReal, pa.basename(target)) : target
        })
        if(!isInside(rootReal, targetReal)){
            throw new FsError("resolve", subpath, `Pfad verlässt '${this.path}' über einen Symlink`)
        }
        return target
    }

    /* ---------- Fabrik ---------- */

    /**
     * Gibt einen {@link File} auf eine Datei innerhalb dieses Ordners.
     *
     * Geprüft wird hier nur textuell, weil die Methode synchron ist; die
     * Symlink-Prüfung greift beim ersten echten Zugriff des zurückgegebenen
     * Objekts.
     *
     * @param subpath Pfad relativ zum Ordner, z.B. "api/users/route.ts"
     * @returns ein File, der den Ordner nicht verlässt
     * @throws {FsError} wenn der Pfad außerhalb liegt oder auf den Ordner selbst zeigt
     * @example
     * ```ts
     * const configs = new Directory("configs")
     * await configs.file("db.json").overwrite('{"port":5432}')
     * ```
     */
    public file(subpath: string): File {
        const target = this.resolve(subpath)
        if(target === this.resolve()){
            throw new FsError("file", subpath, "Pfad zeigt auf den Ordner selbst, nicht auf eine Datei")
        }
        return new File(target)
    }

    /**
     * Gibt einen {@link Directory} auf einen Unterordner.
     *
     * Die Sandbox wird dabei enger, nie weiter - ein Unterordner bleibt im
     * ursprünglichen Ordner gefangen.
     *
     * @param subpath Pfad relativ zum Ordner
     * @returns ein Directory auf den Unterordner
     * @throws {FsError} wenn der Pfad außerhalb liegt
     * @example
     * ```ts
     * const lib = new Directory("src").dir("lib")
     * ```
     */
    public dir(subpath: string): Directory {
        return new Directory(this.resolve(subpath))
    }

    /* ---------- Lesen ---------- */

    /**
     * Liest Dateien samt Inhalt.
     *
     * Ohne `subpath` den Ordner selbst. Zeigt `subpath` auf einen Unterordner,
     * wird dieser gelesen; zeigt er auf eine Datei, kommt genau diese eine
     * Datei zurück - der Rückgabetyp bleibt in allen Fällen derselbe.
     *
     * @param subpath Unterordner oder Datei, oder direkt die Optionen
     * @param options `recursive`, `maxFileSize` und `ignore`
     * @returns pro Datei den Pfad relativ zum Ordner und den Inhalt
     * @throws {FsError} wenn der Pfad außerhalb liegt, nicht existiert oder
     *         eine Datei das Grössenlimit überschreitet
     * @example
     * ```ts
     * await dir.read()                           // oberste Ebene
     * await dir.read({ recursive: true })        // alles
     * await dir.read("lib", { recursive: true }) // nur ein Unterordner
     * ```
     */
    public async read(subpath?: string | DirReadOptions, options: DirReadOptions = {}): Promise<DirFile[]> {
        const [sub, opts] = dirArgs(subpath, options)
        await this.__init()
        const root = this.resolve()
        const target = await this.resolveReal(sub)

        if(await dirExists(target)) return await readDir(target, opts)

        // einzelne Datei - aber nur als Unterpfad, nie der Ordner selbst
        if(target !== root && await fileExist(target)){
            return [{ path: pa.relative(root, target), content: await readFile(target, opts.maxFileSize) }]
        }

        throw new FsError("read", sub ?? ".", `Nichts zu lesen in '${this.path}' - Pfad existiert nicht`)
    }

    /**
     * Wie {@link Directory.read}, lädt aber keine Inhalte - nur die Pfade.
     *
     * Bei grossen Ordnern die richtige Wahl, weil nichts in den Speicher
     * geladen wird.
     *
     * @param subpath Unterordner, oder direkt die Optionen
     * @param options `recursive` und `ignore`
     * @returns die Pfade relativ zum Ordner
     * @throws {FsError} wenn der Pfad außerhalb liegt oder kein Ordner ist
     * @example
     * ```ts
     * await dir.list({ recursive: true })   // ['a.txt', 'api/route.ts']
     * ```
     */
    public async list(subpath?: string | DirReadOptions, options: DirReadOptions = {}): Promise<string[]> {
        const [sub, opts] = dirArgs(subpath, options)
        await this.__init()
        const target = await this.resolveReal(sub)
        if(!(await dirExists(target))){
            throw new FsError("list", sub ?? ".", `Ordner nicht gefunden in '${this.path}'`)
        }
        return await listDir(target, opts)
    }

    /**
     * Gibt jede enthaltene Datei als {@link File} zurück.
     *
     * Dabei wird nichts gelesen - nur die Pfadliste geholt. Der Inhalt wird
     * erst geladen, wenn du eine der Dateien anfasst.
     *
     * @param subpath Unterordner, oder direkt die Optionen
     * @param options `recursive` und `ignore`
     * @returns ein File pro enthaltener Datei
     * @throws {FsError} wenn der Pfad außerhalb liegt oder kein Ordner ist
     * @example
     * ```ts
     * for(const f of await dir.files({ recursive: true })) await f.add("// geprüft")
     * ```
     */
    public async files(subpath?: string | DirReadOptions, options: DirReadOptions = {}): Promise<File[]> {
        const [sub, opts] = dirArgs(subpath, options)
        const base = sub ?? ""
        return (await this.list(sub, opts)).map(rel => this.file(pa.join(base, rel)))
    }

    /* ---------- Massen-Operationen ---------- */

    /**
     * Sucht Dateien, deren relativer Pfad zum Muster passt.
     *
     * Ein String wird als Teilstring verglichen, deshalb funktioniert ".ts"
     * genauso wie "api/".
     *
     * @param match Teilstring oder regulärer Ausdruck
     * @param options `recursive` und `ignore`
     * @returns die passenden Pfade relativ zum Ordner
     * @throws {FsError} wenn der Ordner nicht gelesen werden kann
     * @example
     * ```ts
     * await dir.find(".ts", { recursive: true })
     * await dir.find(/route\.(ts|js)$/, { recursive: true })
     * ```
     */
    public async find(match: string | RegExp, options: DirReadOptions = {}): Promise<string[]> {
        const paths = await this.list(undefined, options)
        return typeof match === "string"
            ? paths.filter(rel => rel.includes(match))
            : paths.filter(rel => match.test(rel))
    }

    /**
     * Führt eine Funktion für jede enthaltene Datei aus und sammelt die
     * Ergebnisse.
     *
     * Läuft standardmässig streng nacheinander: sonst wären bei einem grossen
     * Ordner tausende Dateien gleichzeitig offen und das Handle-Limit des
     * Systems würde reissen. Über `concurrency` lässt sich das kontrolliert
     * erhöhen. Die Ergebnisse behalten in jedem Fall die Reihenfolge der
     * Dateien.
     *
     * @param fn bekommt jede Datei als File und ihren relativen Pfad
     * @param options `recursive`, `ignore` und `concurrency` (Standard 1)
     * @returns die Rückgabewerte von `fn`, in der Reihenfolge der Dateien
     * @throws {FsError} wenn der Ordner nicht gelesen werden kann; Fehler aus
     *         `fn` werden unverändert durchgereicht
     * @example
     * ```ts
     * await dir.each(f => f.update(t => t.replaceAll("alt", "neu")), { recursive: true })
     * await dir.each(f => f.content(), { recursive: true, concurrency: 8 })
     * ```
     */
    public async each<T>(
        fn: (file: File, relPath: string) => T | Promise<T>,
        options: DirReadOptions = {},
    ): Promise<T[]> {
        const relPaths = await this.list(undefined, options)
        const parallel = Math.max(1, options.concurrency ?? 1)
        const results = new Array<T>(relPaths.length)

        if(parallel === 1){
            for(let i = 0; i < relPaths.length; i++){
                results[i] = await fn(this.file(relPaths[i]), relPaths[i])
            }
            return results
        }

        let naechster = 0
        const arbeiter = async (): Promise<void> => {
            while(true){
                const i = naechster++
                if(i >= relPaths.length) return
                results[i] = await fn(this.file(relPaths[i]), relPaths[i])
            }
        }
        await Promise.all(Array.from({ length: Math.min(parallel, relPaths.length) }, arbeiter))
        return results
    }

    /**
     * Zählt die enthaltenen Dateien.
     *
     * Ordner selbst werden nicht mitgezählt, nur Dateien.
     *
     * @param options `recursive` und `ignore`
     * @returns die Anzahl der Dateien
     * @throws {FsError} wenn der Ordner nicht gelesen werden kann
     * @example
     * ```ts
     * await dir.count({ recursive: true })
     * ```
     */
    public async count(options: DirReadOptions = {}): Promise<number> {
        return (await this.list(undefined, options)).length
    }

    /**
     * Summiert die Grösse aller enthaltenen Dateien in Bytes.
     *
     * Fragt nur die Metadaten ab und liest keine Inhalte - der Speicherbedarf
     * bleibt also unabhängig von der Ordnergrösse. Symlinks werden mit `lstat`
     * geprüft, damit ihr Ziel nicht ein zweites Mal zählt.
     *
     * @param options `recursive` und `ignore`
     * @returns die Gesamtgrösse in Bytes
     * @throws {FsError} wenn der Ordner nicht gelesen werden kann
     * @example
     * ```ts
     * const mb = (await dir.size({ recursive: true })) / 1024 / 1024
     * ```
     */
    public async size(options: DirReadOptions = {}): Promise<number> {
        const relPaths = await this.list(undefined, options)
        const BLOCK = 16
        let total = 0
        for(let i = 0; i < relPaths.length; i += BLOCK){
            const teil = relPaths.slice(i, i + BLOCK)
            const groessen = await Promise.all(teil.map(rel =>
                fs.lstat(this.resolve(rel)).then(s => s.size, () => 0)))
            for(const g of groessen) total += g
        }
        return total
    }

    /* ---------- Ordner selbst ---------- */

    /**
     * Prüft, ob der Ordner existiert.
     *
     * Legt ihn dabei nicht an - für einen Pfad, der auf eine Datei zeigt,
     * kommt ebenfalls `false` zurück.
     *
     * @returns `true` wenn der Ordner da ist
     * @example
     * ```ts
     * if(!await dir.exists()) await dir.list()   // legt ihn an
     * ```
     */
    public async exists(): Promise<boolean> {
        return await dirExists(this.path)
    }

    /**
     * Prüft, ob der Ordner keine Dateien enthält.
     *
     * Leere Unterordner zählen nicht als Inhalt - gezählt werden nur Dateien.
     * Bricht bei der ersten gefundenen Datei ab, läuft den Baum also nicht
     * unnötig zu Ende.
     *
     * @returns `true` wenn keine Datei enthalten ist
     * @throws {FsError} wenn der Ordner nicht gelesen werden kann
     * @example
     * ```ts
     * if(await dir.isEmpty()) await dir.delete()
     * ```
     */
    public async isEmpty(): Promise<boolean> {
        await this.__init()
        const root = await this.resolveReal()

        const suche = async (aktuell: string): Promise<boolean> => {
            const entries = await fs.readdir(aktuell, { withFileTypes: true })
                .catch(rethrow("isEmpty", aktuell, "Fehler beim Lesen des Ordners"))
            for(const entry of entries){
                const voll = pa.join(aktuell, entry.name)
                if(entry.isFile()) return true
                if(entry.isSymbolicLink()){
                    const ziel = await fs.stat(voll).catch(() => null)
                    if(ziel?.isFile()) return true
                    continue
                }
                if(entry.isDirectory() && await suche(voll)) return true
            }
            return false
        }
        return !(await suche(root))
    }

    /**
     * Löscht den Ordner samt Inhalt.
     *
     * Existierte er gar nicht, ist das kein Fehler - das Ziel ist ja erreicht.
     * Die Instanz bleibt danach benutzbar: der nächste Zugriff legt den Ordner
     * neu an.
     *
     * @throws {FsError} bei Rechteproblemen
     * @example
     * ```ts
     * await new Directory("build").delete()
     * ```
     */
    public async delete(): Promise<void> {
        if(this.ready) await this.ready.catch(() => {})
        this.ready = null
        await deleteDir(this.path)
    }

    /**
     * Löscht den gesamten Inhalt, behält den Ordner selbst.
     *
     * Wurde der Ordner von außen gelöscht, wird er einfach neu angelegt - das
     * Ergebnis ist dasselbe.
     *
     * @throws {FsError} bei Rechteproblemen
     * @example
     * ```ts
     * await new Directory("dist").toEmpty()   // vor dem nächsten Build
     * ```
     */
    public async toEmpty(): Promise<void> {
        await this.__init()
        const root = this.resolve()
        const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => null)
        if(!entries){
            await createDir(this.path)   // von außen gelöscht -> wieder anlegen
            return
        }
        for(const entry of entries){
            await fs.rm(pa.join(root, entry.name), { recursive: true, force: true })
                .catch(rethrow("empty", pa.join(root, entry.name), "Fehler beim Leeren des Ordners"))
        }
    }

    /**
     * Kopiert den Ordner samt Inhalt an einen anderen Ort.
     *
     * Fehlende Zielordner werden angelegt. Vorhandene Dateien im Ziel werden
     * standardmässig überschrieben. Das Ziel unterliegt bewusst **nicht** der
     * Sandbox und darf außerhalb liegen.
     *
     * @param destination Zielpfad
     * @param options `overwrite` (Standard `true`)
     * @throws {FsError} wenn nicht kopiert werden kann
     * @example
     * ```ts
     * await new Directory("src").copy("backup/src")
     * ```
     */
    public async copy(destination: string, options: { overwrite?: boolean } = {}): Promise<void> {
        await this.__init()
        await copyDir(this.path, destination, options)
    }
}

/**
 * Eine einzelne Datei als Objekt.
 *
 * Die Datei wird beim ersten Zugriff angelegt - samt aller fehlenden Ordner im
 * Pfad. Der Konstruktor selbst fasst das Dateisystem nicht an. Ein frischer
 * File liefert also `""` statt zu werfen.
 *
 * Der Pfad **muss eine Dateiendung haben**. Das prüft schon der Compiler, nicht
 * erst die Laufzeit. Aus der Endung ergibt sich {@link File.dataType}, und
 * damit weiß {@link File.convert}, wie der Inhalt zu lesen ist - unterstützt
 * werden `json`, `csv` und `yaml`/`yml`.
 *
 * Schreibende Methoden geben nichts zurück: Erfolg heißt "läuft durch",
 * Misserfolg heißt {@link FsError}.
 *
 * Soll die Datei garantiert innerhalb eines bestimmten Ordners liegen, erzeuge
 * sie über {@link Directory.file} statt direkt.
 *
 * @typeParam S - der Pfad als String-Literal, damit die Endung prüfbar ist
 * @example
 * ```ts
 * const cfg = new File("configs/app.json")
 * try {
 *     await cfg.overwrite('{"port":3000}')
 *     await cfg.update(text => ({ ...JSON.parse(text), port: 8080 }))
 *     const obj = await cfg.convert<{ port: number }>()   // { port: 8080 }
 * } catch (e) {
 *     if (e instanceof FsError && e.code === "EACCES") return   // keine Rechte
 *     throw e
 * }
 *
 * new File("configs/app")                    // Compilerfehler: keine Endung
 * ```
 */
export class File<S extends string = string> {
    /** aus der Endung abgeleiteter Datentyp - steuert {@link File.convert} */
    public dataType: "json" | "csv" | "yaml" | "none"
    /** der Pfad, wie er übergeben wurde */
    public path: string
    /** Dateiname inklusive Endung */
    public name: string
    /** läuft beim ersten Zugriff an, nicht schon im Konstruktor */
    private ready: Promise<void> | null

    /**
     * Öffnet eine Datei als Objekt.
     *
     * Der Konstruktor fasst das Dateisystem **nicht** an - angelegt wird die
     * Datei erst beim ersten Zugriff, fehlende Ordner ebenfalls.
     *
     * @param path Pfad zur Datei, relativ zum Arbeitsverzeichnis
     * @example
     * ```ts
     * const cfg = new File("configs/app.json")
     * ```
     */
    constructor(path: S & FilePathInput<S>){
        this.path = path
        const parsed = File.parse(path)
        this.name = parsed.name
        this.dataType = parsed.dataType
        this.ready = null
    }

    /**
     * Liest Name und Datentyp aus einem Pfad.
     *
     * Wird vom Konstruktor **und** von {@link File.move} benutzt, damit
     * beide dieselbe Logik verwenden.
     *
     * @param path der zu zerlegende Pfad
     * @returns Dateiname und erkannter Datentyp
     * @example
     * ```ts
     * File.parse("a/b/app.json")   // { name: "app.json", dataType: "json" }
     * ```
     */
    private static parse(path: string){
        const segments = path.split(/[\\/]/)
        const name = segments[segments.length - 1]
        const splittedFile = name.split(".")
        let dataType: "json" | "csv" | "yaml" | "none"
        switch(splittedFile[splittedFile.length - 1].toLowerCase()){
            case "json": dataType = "json"; break
            case "csv": dataType = "csv"; break
            case "yaml":
            case "yml": dataType = "yaml"; break
            default: dataType = "none"; break
        }
        return { name, dataType }
    }

    /**
     * Stellt sicher, dass die Datei existiert. Läuft pro Instanz nur einmal.
     *
     * Ein Konstruktor kann nicht async sein, deshalb passiert das Anlegen hier
     * beim ersten Zugriff. Scheitert es, wird das Promise verworfen - sonst
     * würde jeder spätere Aufruf denselben alten Fehler werfen, auch wenn die
     * Ursache längst behoben ist.
     *
     * @throws {FsError} wenn die Datei nicht angelegt werden kann
     * @example
     * ```ts
     * await this.__init()   // am Anfang jeder öffentlichen Methode
     * ```
     */
    private async __init(): Promise<void> {
        if(!this.ready) this.ready = createFile(this.path, "")
        try { await this.ready }
        catch(e){ this.ready = null; throw e }
    }

    /**
     * Überschreibt die Datei komplett mit neuem Inhalt.
     *
     * Geschrieben wird zuerst in eine Nebendatei, die anschließend per Rename
     * an die Stelle der Originaldatei tritt. Rename ist auf demselben
     * Dateisystem atomar - es gibt also keinen Moment, in dem die Datei leer
     * oder halb geschrieben auf der Platte liegt. Bricht der Vorgang ab, bleibt
     * das Original unangetastet und die Nebendatei wird aufgeräumt.
     *
     * @param content der neue Inhalt
     * @throws {FsError} wenn nicht geschrieben werden kann
     * @example
     * ```ts
     * await new File("app.json").overwrite('{"port":3000}')
     * ```
     */
    public async overwrite(content: string): Promise<void> {
        await this.__init()
        await overwriteFile(this.path, content, "overwrite")
    }

    /**
     * Liest den kompletten Inhalt der Datei als String.
     *
     * Die Datei wird beim ersten Zugriff automatisch angelegt, ein frischer
     * File liefert also `""` statt zu werfen, ausser der pfad exestiert schon
     * mit einer Datei dann wird dessen inhalt gegeben!
     *
     * @param options `maxSize` begrenzt die Dateigrösse in Bytes
     * @returns der Dateiinhalt
     * @throws {FsError} wenn die Datei nicht gelesen werden kann oder zu gross ist
     * @example
     * ```ts
     * const file = new File("notes.txt")
     * const content = await file.content()
     * ```
     */
    public async content({ maxSize = MAX_FILE_SIZE }: { maxSize?: number } = {}): Promise<string> {
        await this.__init()
        return await readFile(this.path, maxSize)
    }

    /**
     * Liest den Inhalt zeilenweise.
     *
     * Getrennt wird an `\n`, `\r\n` oder `\r`. Endet die Datei mit einem
     * Zeilenumbruch, ist der letzte Eintrag ein leerer String.
     *
     * @returns die Zeilen der Datei
     * @throws {FsError} wenn die Datei nicht gelesen werden kann
     * @example
     * ```ts
     * const zeilen = await log.lines()
     * ```
     */
    public async lines(): Promise<string[]> {
        await this.__init()
        return await readFileLines(this.path)
    }

    /**
     * Hängt Inhalt als neue Zeile an die Datei an.
     *
     * Bei einer leeren Datei wird kein führendes `\n` gesetzt.
     *
     * @param content der anzuhängende Text
     * @throws {FsError} wenn nicht geschrieben werden kann
     * @example
     * ```ts
     * const log = new File("app.log")
     * await log.add("Server gestartet")
     * ```
     */
    public async add(content: string): Promise<void> {
        await this.__init()
        await addToFile(this.path, content)
    }

    /**
     * Entfernt das **erste** Vorkommen eines Textes aus der Datei.
     *
     * Gesucht wird wörtlich, nicht als regulärer Ausdruck. Kommt der Text nicht
     * vor, bleibt die Datei unverändert. Geschrieben wird atomar über
     * {@link File.overwrite}.
     *
     * @param content der zu entfernende Text
     * @throws {FsError} wenn nicht gelesen oder geschrieben werden kann
     * @example
     * ```ts
     * await file.remove("// TODO: aufräumen")
     * ```
     */
    public async remove(content: string): Promise<void> {
        await this.update(inhalt => inhalt.replace(content, ""))
    }

    /**
     * Löscht die Datei.
     *
     * Existierte sie gar nicht, ist das kein Fehler - das Ziel ist ja erreicht.
     * Die Instanz bleibt danach benutzbar: der nächste Zugriff legt die Datei
     * neu an.
     *
     * @throws {FsError} bei Rechteproblemen
     * @example
     * ```ts
     * await new File("tmp/cache.json").delete()
     * ```
     */
    public async delete(): Promise<void> {
        if(this.ready) await this.ready.catch(() => {})
        this.ready = null
        await removeFile(this.path)
    }

    /**
     * Kopiert die Datei an einen anderen Ort. Das Original bleibt bestehen.
     *
     * Fehlende Zielordner werden angelegt. Ein vorhandenes Ziel wird
     * standardmässig **überschrieben** - mit `overwrite: false` wirft die
     * Methode stattdessen. Zeigt das Ziel auf dieselbe Datei, passiert nichts.
     *
     * @param newPath Zielpfad, muss eine Dateiendung haben
     * @param options `overwrite` (Standard `true`)
     * @throws {FsError} `EEXIST` wenn das Ziel existiert und `overwrite` false ist
     * @example
     * ```ts
     * await cfg.copy("backup/app.json")
     * await cfg.copy("backup/app.json", { overwrite: false })
     * ```
     */
    public async copy<N extends string>(
        newPath: N & FilePathInput<N>,
        options: { overwrite?: boolean } = {},
    ): Promise<void> {
        await this.__init()
        const ziel = newPath as string
        if(pa.resolve(this.path) === pa.resolve(ziel)) return   // sonst wuerde copyFile die Datei leeren
        await copyFile(this.path, ziel, options)
    }

    /**
     * Prüft, ob die Datei einen bestimmten Text enthält.
     *
     * Verglichen wird wörtlich und mit Beachtung von Groß- und Kleinschreibung.
     *
     * @param content der gesuchte Text
     * @returns `true` wenn der Text vorkommt
     * @throws {FsError} wenn die Datei nicht gelesen werden kann
     * @example
     * ```ts
     * const hatTodo = await file.contains("TODO")
     * ```
     */
    public async contains(content: string): Promise<boolean> {
        return (await this.content()).includes(content)
    }

    /**
     * Liest, verändert und speichert die Datei in einem Schritt.
     *
     * Gibt `fn` einen String zurück, wird der unverändert geschrieben. `null`
     * leert die Datei. Alles andere landet als eingerücktes JSON darin.
     * Geschrieben wird erst nach `fn` und atomar - wirft `fn`, bleibt die Datei
     * unangetastet.
     *
     * Gibt `fn` **`undefined`** zurück, wirft die Methode. Das ist fast immer
     * ein vergessenes `return` im Callback, und würde die Datei sonst still
     * leeren.
     *
     * @param fn bekommt den aktuellen Inhalt, gibt den neuen zurück
     * @throws {FsError} wenn `fn` `undefined` liefert oder nicht geschrieben
     *         werden kann; Fehler aus `fn` werden unverändert durchgereicht
     * @example
     * ```ts
     * await file.update(text => text.toUpperCase())
     * await file.update(text => ({ ...JSON.parse(text), version: 2 }))
     * ```
     */
    public async update(fn: (content: string) => any): Promise<void> {
        await this.__init()
        const fileContent = await this.content()
        const neu = await fn(fileContent)
        if(neu === undefined){
            throw new FsError("update", this.path,
                "Callback hat undefined zurückgegeben - Datei bleibt unverändert (fehlt ein return?)")
        }
        await this.overwrite(toFileContent(neu))
    }

    /**
     * Prüft, ob die Datei leer ist.
     *
     * Eine Datei, die nur Leerzeichen oder Zeilenumbrüche enthält, gilt als
     * **nicht** leer.
     *
     * @returns `true` wenn die Datei keinen Inhalt hat
     * @throws {FsError} wenn die Datei nicht gelesen werden kann
     * @example
     * ```ts
     * if(await file.isEmpty()) await file.add("# neu angelegt")
     * ```
     */
    public async isEmpty(): Promise<boolean> {
        return (await this.content()).length === 0
    }

    /**
     * Verschiebt die Datei und richtet die Instanz auf den neuen Ort aus.
     *
     * `path`, `name` und `dataType` werden mitgezogen. Innerhalb desselben
     * Dateisystems genügt ein Rename - ein einziger Syscall, ohne die Datei zu
     * kopieren. Liegt das Ziel auf einem anderen Dateisystem (`EXDEV`), wird
     * kopiert und erst danach gelöscht; schlägt die Kopie fehl, bleibt das
     * Original unangetastet.
     *
     * @param newPath Zielpfad, muss eine Dateiendung haben
     * @param options `overwrite` (Standard `true`)
     * @throws {FsError} `EEXIST` wenn das Ziel existiert und `overwrite` false ist
     * @example
     * ```ts
     * const f = new File("daten.json")
     * await f.move("archiv/daten.json")
     * ```
     */
    public async move<N extends string>(
        newPath: N & FilePathInput<N>,
        options: { overwrite?: boolean } = {},
    ): Promise<void> {
        await this.__init()
        const ziel = newPath as string
        if(pa.resolve(this.path) === pa.resolve(ziel)) return

        if(options.overwrite === false && await fileExist(ziel)){
            const err = new FsError("move", ziel, "Ziel existiert bereits")
            err.code = "EEXIST"
            throw err
        }

        await fs.mkdir(pa.dirname(pa.resolve(ziel)), { recursive: true })
            .catch(rethrow("move", ziel, "Fehler beim Erstellen des Zielordners"))

        const umbenannt = await fs.rename(this.path, ziel).then(() => true, (e: NodeJS.ErrnoException) => {
            if(e.code === "EXDEV") return false      // anderes Dateisystem -> kopieren
            throw new FsError("move", this.path, `Fehler beim Verschieben nach '${ziel}'`, e)
        })

        if(!umbenannt){
            await copyFile(this.path, ziel, options)
            await removeFile(this.path)
        }

        this.path = ziel
        const parsed = File.parse(ziel)
        this.name = parsed.name
        this.dataType = parsed.dataType
        this.ready = null
    }

    /**
     * Konvertiert den Dateiinhalt anhand der Endung in ein JS-Objekt.
     *
     * Unterstützt `json`, `csv` und `yaml`/`yml` - siehe
     * {@link File.dataType}. Eine leere Datei ergibt bei allen drei
     * Formaten `{}`. Ein BOM am Dateianfang wird entfernt.
     *
     * **JSON** gibt den geparsten Wert zurück - auch ein blosses `42` oder
     * `"text"` ist gültiges JSON und kommt unverändert an.
     *
     * **CSV** wird spaltenweise abgebildet: `{ spalte: [wert, wert, ...] }`.
     * Der Trenner (`,`, `;` oder Tab) wird am ersten Datensatz erkannt.
     * Gequotete Felder nach RFC 4180 werden unterstützt, inklusive Kommas,
     * Zeilenumbrüchen und verdoppelten Anführungszeichen im Feld. Werte bleiben
     * **immer Strings**, damit `007` und Telefonnummern erhalten bleiben.
     * Fehlende Felder am Zeilenende werden mit `""` aufgefüllt - "fehlt" und
     * "leer" sind dadurch nicht unterscheidbar.
     *
     * **YAML** deckt Mappings, Listen, Listen von Objekten, Block-Scalars
     * (`|`, `>` mit `-`/`+`), Flow-Syntax (`[a, b]`, `{a: 1}`), Kommentare und
     * Quoting ab. Nicht unterstützte Konstrukte (Multi-Dokument `---`, Anchors,
     * Aliases, Tags, Merge-Keys) werfen mit Zeilennummer, statt still falsche
     * Daten zu liefern.
     *
     * @typeParam T - erwartete Form des Ergebnisses
     * @returns das geparste Objekt
     * @throws {FsError} bei unbekannter Endung, oder wenn der Inhalt nicht
     *         geparst werden kann - mit Format und Zeilennummer in der Meldung
     * @example
     * ```ts
     * const cfg = await new File("config.json").convert<{ port: number }>()
     * ```
     */
    public async convert<T = unknown>(): Promise<T> {
        await this.__init()

        // ---- Vorbau ----
        let text = await this.content()
        if(text.charCodeAt(0) === 0xFEFF) text = text.slice(1)          // BOM weg
        if(text.trim() === "") return {} as T                            // einheitlich fuer alle Formate

        switch(this.dataType){

        // ---- JSON ----
        case "json": {
            try {
                return JSON.parse(text) as T
            } catch(e) {
                throw new FsError("convert", this.path,
                    `JSON-Fehler: ${(e as Error).message}`, e)
            }
        }

        // ---- CSV ----
        case "csv": {
            const csvFehler = (zeile: number, msg: string): never => {
                throw new FsError("convert", this.path, `CSV-Fehler in Zeile ${zeile}: ${msg}`)
            }

            // Trenner am ersten logischen Datensatz erkennen, Quotes beachten
            const zaehler: Record<string, number> = { ",": 0, ";": 0, "\t": 0 }
            let zInQ = false
            for(let i = 0; i < text.length; i++){
                const c = text[i]
                if(zInQ){
                    if(c === '"'){ if(text[i + 1] === '"') i++; else zInQ = false }
                    continue
                }
                if(c === '"'){ zInQ = true; continue }
                if(c === "\n" || c === "\r") break
                if(c in zaehler) zaehler[c]++
            }
            let delim = ","
            let bestN = 0
            for(const k of [",", ";", "\t"]){
                if(zaehler[k] > bestN){ delim = k; bestN = zaehler[k] }
            }

            // zeichenweise State-Machine ueber den Gesamttext
            const records: string[][] = []
            const startZeilen: number[] = []
            let feld = ""
            let record: string[] = []
            let inQuotes = false
            let nachQuote = false
            let feldGequotet = false
            let zeile = 1
            let recordStart = 1

            const feldEnde = () => {
                record.push(feldGequotet ? feld : feld.trim())   // Trim nur fuer ungequotete Felder
                feld = ""
                feldGequotet = false
                nachQuote = false
            }
            const recordEnde = () => {
                feldEnde()
                if(!(record.length === 1 && record[0] === "")){   // ganz leere Datensaetze ueberspringen
                    records.push(record)
                    startZeilen.push(recordStart)
                }
                record = []
            }

            for(let i = 0; i < text.length; i++){
                const c = text[i]

                if(inQuotes){
                    if(c === '"'){
                        if(text[i + 1] === '"'){ feld += '"'; i++ }   // "" ist ein literales "
                        else { inQuotes = false; nachQuote = true }
                    } else {
                        if(c === "\n") zeile++                        // Umbruch im Feld zaehlt trotzdem
                        feld += c
                    }
                    continue
                }

                if(nachQuote && c !== delim && c !== "\n" && c !== "\r"){
                    if(c === " " || c === "\t") continue              // Leerraum ist erlaubt
                    csvFehler(zeile, "Zeichen nach schließendem Anführungszeichen")
                }

                if(c === delim){ feldEnde(); continue }
                if(c === "\r" || c === "\n"){
                    if(c === "\r" && text[i + 1] === "\n") i++
                    recordEnde()
                    zeile++
                    recordStart = zeile
                    continue
                }
                if(c === '"' && feld === "" && !feldGequotet){ inQuotes = true; feldGequotet = true; continue }
                feld += c
            }
            if(inQuotes) csvFehler(zeile, "Anführungszeichen wird nicht geschlossen")
            if(feld !== "" || feldGequotet || record.length > 0) recordEnde()   // Datei ohne End-Umbruch
            if(records.length === 0) return {} as T

            // Header
            const namen = records[0].map((h, i) => h.trim() === "" ? `col_${i + 1}` : h)
            const doppelt = [...new Set(namen.filter((n, i) => namen.indexOf(n) !== i))]
            if(doppelt.length){
                csvFehler(startZeilen[0], `doppelte Spaltennamen: ${doppelt.join(", ")}`)
            }

            // Object.create(null): ein Header "__proto__" wuerde sonst den Prototyp setzen
            const tabelle: Record<string, string[]> = Object.create(null)
            for(const n of namen) tabelle[n] = []

            for(let r = 1; r < records.length; r++){
                const zeilenNr = startZeilen[r]
                if(records[r].length > namen.length){
                    csvFehler(zeilenNr, `${records[r].length} Felder, aber nur ${namen.length} Spalten`)
                }
                namen.forEach((n, k) => tabelle[n].push(records[r][k] ?? ""))   // fehlende -> ""
            }
            return tabelle as T
        }

        // ---- YAML ----
        case "yaml": {
            type YZeile = { text: string, nr: number }
            const alle: YZeile[] = text.split(/\r\n|\r|\n/).map((t, i) => ({ text: t, nr: i + 1 }))

            const yFehler = (nr: number, msg: string): never => {
                throw new FsError("convert", this.path, `YAML-Fehler in Zeile ${nr}: ${msg}`)
            }
            const einzug = (t: string): number => (t.match(/^[ \t]*/) as RegExpMatchArray)[0].length

            // Tabs in der Einrueckung verfaelschen jede Ebenenberechnung
            for(const z of alle){
                if(z.text.trim() === "") continue
                if((z.text.match(/^[ \t]*/) as RegExpMatchArray)[0].includes("\t")){
                    yFehler(z.nr, "Tab in der Einrückung - YAML verlangt Leerzeichen")
                }
            }

            // Inline-Kommentare quote-bewusst abschneiden
            const ohneKommentar = (t: string): string => {
                let inD = false, inS = false
                for(let i = 0; i < t.length; i++){
                    const c = t[i]
                    if(inD){ if(c === "\\"){ i++; continue } if(c === '"') inD = false; continue }
                    if(inS){ if(c === "'"){ if(t[i + 1] === "'") i++; else inS = false } continue }
                    if(c === '"'){ inD = true; continue }
                    if(c === "'"){ inS = true; continue }
                    if(c === "#" && (i === 0 || t[i - 1] === " " || t[i - 1] === "\t")) return t.slice(0, i)
                }
                return t
            }

            // relevante Zeilen, Nummern bleiben erhalten
            const rel: YZeile[] = []
            for(const z of alle){
                const t = ohneKommentar(z.text).replace(/\s+$/, "")
                if(t.trim() === "") continue
                rel.push({ text: t, nr: z.nr })
            }
            if(rel.length === 0) return {} as T

            // ':' als Key-Trenner finden - ausserhalb von Quotes und Klammern
            const keyTrenner = (t: string): number => {
                let inD = false, inS = false, tiefe = 0
                for(let i = 0; i < t.length; i++){
                    const c = t[i]
                    if(inD){ if(c === "\\"){ i++; continue } if(c === '"') inD = false; continue }
                    if(inS){ if(c === "'"){ if(t[i + 1] === "'") i++; else inS = false } continue }
                    if(c === '"'){ inD = true; continue }
                    if(c === "'"){ inS = true; continue }
                    if(c === "[" || c === "{"){ tiefe++; continue }
                    if(c === "]" || c === "}"){ tiefe--; continue }
                    if(c === ":" && tiefe === 0 && (i === t.length - 1 || t[i + 1] === " ")) return i
                }
                return -1
            }

            const quoteEnde = (v: string, q: string, nr: number): number => {
                for(let i = 1; i < v.length; i++){
                    if(q === '"' && v[i] === "\\"){ i++; continue }
                    if(v[i] === q){
                        if(q === "'" && v[i + 1] === "'"){ i++; continue }
                        return i
                    }
                }
                return yFehler(nr, "Anführungszeichen wird nicht geschlossen")
            }

            const parseFlow = (v: string, nr: number): any => {
                const auf = v[0]
                const zu = auf === "[" ? "]" : "}"
                if(v[v.length - 1] !== zu) yFehler(nr, `Flow-Syntax nicht geschlossen ('${zu}' erwartet)`)
                const inner = v.slice(1, -1).trim()
                if(inner === "") return auf === "[" ? [] : Object.create(null)

                const teile: string[] = []
                let akt = "", tiefe = 0, inD = false, inS = false
                for(let i = 0; i < inner.length; i++){
                    const c = inner[i]
                    if(inD){ akt += c; if(c === "\\"){ akt += inner[++i] ?? ""; continue } if(c === '"') inD = false; continue }
                    if(inS){ akt += c; if(c === "'"){ if(inner[i + 1] === "'"){ akt += inner[++i]; continue } inS = false } continue }
                    if(c === '"'){ inD = true; akt += c; continue }
                    if(c === "'"){ inS = true; akt += c; continue }
                    if(c === "[" || c === "{"){ tiefe++; akt += c; continue }
                    if(c === "]" || c === "}"){ tiefe--; akt += c; continue }
                    if(c === "," && tiefe === 0){ teile.push(akt); akt = ""; continue }
                    akt += c
                }
                if(akt.trim() !== "") teile.push(akt)

                if(auf === "[") return teile.map(t => parseValue(t, nr))
                const obj: Record<string, any> = Object.create(null)
                for(const t of teile){
                    const idx = keyTrenner(t.trim())
                    if(idx === -1) yFehler(nr, `Flow-Mapping: '${t.trim()}' ist kein 'key: wert'-Paar`)
                    const roh = t.trim()
                    obj[roh.slice(0, idx).trim()] = parseValue(roh.slice(idx + 1), nr)
                }
                return obj
            }

            const parseValue = (roh: string, nr: number): any => {
                const v = roh.trim()
                if(v === "" || v === "null" || v === "~") return null
                if(v === "true") return true
                if(v === "false") return false
                if(v.startsWith("&")) yFehler(nr, "Anchors (&name) werden nicht unterstützt")
                if(v.startsWith("*")) yFehler(nr, "Aliases (*name) werden nicht unterstützt")
                if(v.startsWith("!")) yFehler(nr, "Tags (!typ) werden nicht unterstützt")
                if(v.startsWith("[") || v.startsWith("{")) return parseFlow(v, nr)

                if(v.startsWith('"')){
                    if(quoteEnde(v, '"', nr) !== v.length - 1) yFehler(nr, "Zeichen nach schließendem Anführungszeichen")
                    return v.slice(1, -1).replace(/\\(["\\ntr])/g, (_m, c) =>
                        c === "n" ? "\n" : c === "t" ? "\t" : c === "r" ? "\r" : c)
                }
                if(v.startsWith("'")){
                    if(quoteEnde(v, "'", nr) !== v.length - 1) yFehler(nr, "Zeichen nach schließendem Anführungszeichen")
                    return v.slice(1, -1).replace(/''/g, "'")
                }

                if(/^-?\d+$/.test(v)){
                    if(/^-?0\d/.test(v)) return v                      // fuehrende Null: PLZ bleibt String
                    const n = Number(v)
                    return Number.isSafeInteger(n) ? n : v             // sonst Praezisionsverlust
                }
                if(/^-?\d+\.\d+$/.test(v)){
                    if(/^-?0\d/.test(v)) return v
                    return Number(v)
                }
                return v
            }

            const parseBlock = (start: number, indent: number): [any, number] => {
                let i = start
                const ersterInhalt = rel[start].text.trim()
                const istListe = ersterInhalt === "-" || ersterInhalt.startsWith("- ")
                const result: any = istListe ? [] : Object.create(null)
                const gesehen = new Set<string>()

                while(i < rel.length){
                    const z = rel[i]
                    const ein = einzug(z.text)
                    if(ein < indent) break
                    const inhalt = z.text.trim()

                    if(inhalt === "---" || inhalt.startsWith("--- ")) yFehler(z.nr, "Multi-Dokument (---) wird nicht unterstützt")
                    if(inhalt === "...") yFehler(z.nr, "Dokument-Ende (...) wird nicht unterstützt")
                    if(inhalt.startsWith("<<:")) yFehler(z.nr, "Merge-Key (<<:) wird nicht unterstützt")

                    // --- Listenelement ---
                    if(Array.isArray(result)){
                        if(ein > indent) yFehler(z.nr, "unerwartete Einrückung")
                        if(!(inhalt === "-" || inhalt.startsWith("- "))) break

                        if(inhalt === "-"){
                            const naechste = rel[i + 1]
                            if(naechste && einzug(naechste.text) > ein){
                                const [kind, next] = parseBlock(i + 1, einzug(naechste.text))
                                result.push(kind)
                                i = next
                            } else {
                                result.push(null)          // nackter Eintrag
                                i++
                            }
                            continue
                        }

                        const rest = inhalt.slice(2).trim()
                        const nurListe = rest === "-" || rest.startsWith("- ")
                        const istMapping = !rest.startsWith("[") && !rest.startsWith("{") && keyTrenner(rest) !== -1

                        if(istMapping || nurListe){
                            // "- name: web" wird zu "  name: web": gleiche Spalte, eigener Block
                            const dashPos = z.text.indexOf("-")
                            rel[i] = { text: z.text.slice(0, dashPos) + "  " + z.text.slice(dashPos + 2), nr: z.nr }
                            const [kind, next] = parseBlock(i, dashPos + 2)
                            result.push(kind)
                            i = next
                            continue
                        }

                        result.push(parseValue(rest, z.nr))
                        i++
                        continue
                    }

                    // --- Mapping ---
                    if(ein > indent) yFehler(z.nr, "unerwartete Einrückung")

                    const sep = keyTrenner(inhalt)
                    if(sep === -1) yFehler(z.nr, "weder 'key:' noch Listeneintrag")

                    const key = inhalt.slice(0, sep).trim()
                    if(gesehen.has(key)) yFehler(z.nr, `doppelter Schlüssel '${key}'`)
                    gesehen.add(key)
                    const rest = inhalt.slice(sep + 1).trim()

                    // Block-Scalar: | und > mit optionalem Chomping
                    if(/^[|>][-+]?$/.test(rest)){
                        const stil = rest[0]
                        const chomp = rest.length > 1 ? rest[1] : ""
                        const roh: string[] = []
                        let letzteNr = z.nr
                        for(const raw of alle){
                            if(raw.nr <= z.nr) continue
                            if(raw.text.trim() === ""){ roh.push(""); letzteNr = raw.nr; continue }
                            if(einzug(raw.text) <= ein) break
                            roh.push(raw.text)
                            letzteNr = raw.nr
                        }
                        let leerAmEnde = 0
                        while(roh.length && roh[roh.length - 1] === ""){ roh.pop(); leerAmEnde++ }

                        const echte = roh.filter(t => t.trim() !== "")
                        const minEin = echte.length ? Math.min(...echte.map(einzug)) : 0
                        const inhalte = roh.map(t => t.trim() === "" ? "" : t.slice(minEin))

                        let wert: string
                        if(stil === "|"){
                            wert = inhalte.join("\n")
                        } else {
                            const absaetze: string[] = []
                            let akt: string[] = []
                            for(const l of inhalte){
                                if(l === ""){ absaetze.push(akt.join(" ")); akt = [] }
                                else akt.push(l)
                            }
                            absaetze.push(akt.join(" "))
                            wert = absaetze.join("\n")
                        }
                        if(chomp === "-") { /* kein abschliessender Umbruch */ }
                        else if(chomp === "+") wert += "\n".repeat(1 + leerAmEnde)
                        else wert += "\n"

                        result[key] = wert
                        while(i < rel.length && rel[i].nr <= letzteNr) i++
                        continue
                    }

                    if(rest !== ""){
                        result[key] = parseValue(rest, z.nr)
                        i++
                        continue
                    }

                    // Wert steht in den Folgezeilen
                    const naechste = rel[i + 1]
                    if(naechste){
                        const nEin = einzug(naechste.text)
                        const nInhalt = naechste.text.trim()
                        const istUnterListe = nEin === ein && (nInhalt === "-" || nInhalt.startsWith("- "))
                        if(nEin > ein || istUnterListe){
                            const [kind, next] = parseBlock(i + 1, nEin)
                            result[key] = kind
                            i = next
                            continue
                        }
                    }
                    result[key] = null
                    i++
                }
                return [result, i]
            }

            const basis = Math.min(...rel.map(z => einzug(z.text)))
            const [ergebnis, ende] = parseBlock(0, basis)
            if(ende < rel.length) yFehler(rel[ende].nr, "unerwartete Einrückung")
            return ergebnis as T
        }

        default:
            throw new FsError("convert", this.path,
                `Unbekannte Endung '${this.name}' - unterstützt werden json, csv und yaml`)
        }
    }
}


