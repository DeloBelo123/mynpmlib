import * as fs from 'node:fs/promises'
import * as pa from 'path'
import type { DirFile, DirReadOptions, FilePathInput, NonNullable } from './types.js'
import {
    addToFile,
    copyDir,
    copyFile,
    createDir,
    createFile,
    deleteDir,
    dirExists,
    fileExist,
    listDir,
    readDir,
    readFile,
    readFileLines,
    removeFile,
} from './funcs.js'

/**
 * Ein Ordner als abgeschlossener Arbeitsbereich.
 *
 * Jeder Pfad, den du an eine Methode gibst, wird relativ zu diesem Ordner
 * aufgelöst und muss **innerhalb** davon liegen - sonst fliegt ein Fehler.
 * Damit kann nichts außerhalb gelesen oder geschrieben werden.
 *
 * @example
 * ```ts
 * const src = new DirPath("src/app")
 * const route = src.file("api/users/route.ts")  // FilePath, garantiert innerhalb
 * await route.overwrite("export function GET(){}")
 *
 * for(const f of await src.read({ recursive: true })) console.log(f.path)
 * ```
 */
export class DirPath {
    public name: string
    public path: string
    private ready: Promise<boolean> | null
    /**
     * Öffnet einen Ordner als abgeschlossenen Arbeitsbereich.
     *
     * Der Ordner wird beim ersten Zugriff angelegt, samt aller fehlenden
     * Zwischenordner.
     *
     * @param path Pfad zum Ordner, relativ zum Arbeitsverzeichnis
     * @example
     * ```ts
     * const src = new DirPath("src/app")
     * ```
     */
    constructor(path:string){
        this.path = path
        this.ready = createDir(this.path)
        this.name = pa.basename(pa.resolve(path)) || pa.resolve(path)
    }

    /**
     * Stellt sicher, dass der Ordner existiert.
     *
     * Läuft pro Instanz nur einmal, weil auf ein gemerktes Promise gewartet
     * wird statt jedes Mal neu anzulegen.
     *
     * @returns nichts - wirft nur, wenn das Anlegen scheitert
     * @example
     * ```ts
     * await this.__init()   // am Anfang jeder öffentlichen Methode
     * ```
     */
    private async __init(){
        if(!this.ready) this.ready = createDir(this.path)
        await this.ready
    }

    /**
     * Löst einen Unterpfad gegen den Ordner auf und stellt sicher, dass er
     * den Ordner nicht verlässt.
     *
     * `..` ist nach dem Auflösen bereits verrechnet und wird damit
     * abgefangen. Verglichen wird gegen den Wurzelpfad **plus Trennzeichen**,
     * sonst würde "/data-alt" als Treffer für "/data" durchgehen.
     *
     * @param subpath Pfad relativ zum Ordner, leer meint den Ordner selbst
     * @returns der absolute Pfad innerhalb des Ordners
     * @throws wenn der Pfad außerhalb liegt
     * @example
     * ```ts
     * this.resolve("api/route.ts")   // -> /abs/pfad/api/route.ts
     * this.resolve("../geheim.txt")  // wirft
     * ```
     */
    private resolve(subpath: string = ""): string {
        const root = pa.resolve(this.path)
        const target = pa.resolve(root, subpath)
        // root + Separator, sonst würde "/data-alt" als Treffer für "/data" gelten
        if(target !== root && !target.startsWith(root + pa.sep)){
            throw new Error(`Pfad liegt außerhalb von '${this.path}': ${subpath}`)
        }
        return target
    }

    /**
     * Gibt einen {@link FilePath} auf eine Datei innerhalb dieses Ordners.
     *
     * Die Datei wird beim ersten Zugriff angelegt, fehlende Zwischenordner
     * ebenfalls.
     *
     * @param subpath Pfad relativ zum Ordner, z.B. "api/users/route.ts"
     * @returns ein FilePath, der den Ordner garantiert nicht verlässt
     * @throws wenn der Pfad außerhalb liegt oder auf den Ordner selbst zeigt
     * @example
     * ```ts
     * const configs = new DirPath("configs")
     * await configs.file("db.json").overwrite('{"port":5432}')
     * ```
     */
    public file(subpath: string): FilePath {
        const target = this.resolve(subpath)
        if(target === this.resolve()){
            throw new Error(`'${subpath}' zeigt auf den Ordner selbst, nicht auf eine Datei`)
        }
        return new FilePath(target)
    }

    /**
     * Gibt einen {@link DirPath} auf einen Unterordner.
     *
     * Die Sandbox wird dabei enger, nie weiter - ein Unterordner bleibt im
     * ursprünglichen Ordner gefangen.
     *
     * @param subpath Pfad relativ zum Ordner
     * @returns ein DirPath auf den Unterordner
     * @throws wenn der Pfad außerhalb liegt
     * @example
     * ```ts
     * const lib = new DirPath("src").dir("lib")
     * ```
     */
    public dir(subpath: string): DirPath {
        return new DirPath(this.resolve(subpath))
    }

    /**
     * Liest Dateien samt Inhalt.
     *
     * Ohne `subpath` den Ordner selbst. Zeigt `subpath` auf einen Unterordner,
     * wird dieser gelesen; zeigt er auf eine Datei, kommt genau diese eine
     * Datei zurück - der Rückgabetyp bleibt in allen Fällen derselbe.
     *
     * @param subpath Unterordner oder Datei, oder direkt die Optionen
     * @param options `recursive` bezieht Unterordner mit ein
     * @returns pro Datei den Pfad relativ zum Ordner und den Inhalt
     * @throws wenn der Pfad außerhalb liegt oder nicht existiert
     * @example
     * ```ts
     * await dir.read()                           // oberste Ebene
     * await dir.read({ recursive: true })        // alles
     * await dir.read("lib", { recursive: true }) // nur ein Unterordner
     * ```
     */
    public async read(subpath?: string | DirReadOptions, options: DirReadOptions = {}): Promise<DirFile[]> {
        const [sub, { recursive = false }] = dirArgs(subpath, options)
        await this.__init()
        const root = this.resolve()
        const target = this.resolve(sub)

        if(await dirExists(target)) return await readDir(target, { recursive })

        // einzelne Datei - aber nur als Unterpfad, nie der Ordner selbst
        if(target !== root && await fileExist(target)){
            return [{ path: pa.relative(root, target), content: await readFile(target) }]
        }

        throw new Error(`Nichts zu lesen in '${this.path}': '${sub ?? "."}' existiert nicht`)
    }

    /**
     * Wie {@link DirPath.read}, lädt aber keine Inhalte - nur die Pfade.
     *
     * Bei großen Ordnern die richtige Wahl, weil nichts in den Speicher
     * geladen wird.
     *
     * @param subpath Unterordner, oder direkt die Optionen
     * @param options `recursive` bezieht Unterordner mit ein
     * @returns die Pfade relativ zum Ordner
     * @throws wenn der Pfad außerhalb liegt oder kein Ordner ist
     * @example
     * ```ts
     * await dir.list({ recursive: true })   // ['a.txt', 'api/route.ts']
     * ```
     */
    public async list(subpath?: string | DirReadOptions, options: DirReadOptions = {}): Promise<string[]> {
        const [sub, { recursive = false }] = dirArgs(subpath, options)
        await this.__init()
        const target = this.resolve(sub)
        if(!(await dirExists(target))) throw new Error(`Ordner nicht gefunden in '${this.path}': ${sub ?? "."}`)
        return await listDir(target, { recursive })
    }

    /**
     * Gibt jede enthaltene Datei als {@link FilePath} zurück.
     *
     * Dabei wird nichts gelesen - nur die Pfadliste geholt. Der Inhalt wird
     * erst geladen, wenn du eine der Dateien anfasst.
     *
     * @param subpath Unterordner, oder direkt die Optionen
     * @param options `recursive` bezieht Unterordner mit ein
     * @returns ein FilePath pro enthaltener Datei
     * @example
     * ```ts
     * for(const f of await dir.files({ recursive: true })) await f.add("// geprüft")
     * ```
     */
    public async files(subpath?: string | DirReadOptions, options: DirReadOptions = {}): Promise<FilePath[]> {
        const [sub, opts] = dirArgs(subpath, options)
        const base = sub ?? ""
        return (await this.list(sub, opts)).map(rel => this.file(pa.join(base, rel)))
    }

    /**
     * Sucht Dateien, deren relativer Pfad zum Muster passt.
     *
     * Ein String wird als Teilstring verglichen, deshalb funktioniert ".ts"
     * genauso wie "api/".
     *
     * @param match Teilstring oder regulärer Ausdruck
     * @param options `recursive` bezieht Unterordner mit ein
     * @returns die passenden Pfade relativ zum Ordner
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
     * Läuft bewusst nacheinander statt parallel: sonst wären bei einem großen
     * Ordner tausende Dateien gleichzeitig offen und das Handle-Limit des
     * Systems würde reißen.
     *
     * @param fn bekommt jede Datei als FilePath und ihren relativen Pfad
     * @param options `recursive` bezieht Unterordner mit ein
     * @returns die Rückgabewerte von `fn`, in der Reihenfolge der Dateien
     * @example
     * ```ts
     * await dir.each(f => f.update(t => t.replaceAll("alt", "neu")), { recursive: true })
     * ```
     */
    public async each<T>(fn: (file: FilePath, relPath: string) => T | Promise<T>, options: DirReadOptions = {}): Promise<T[]> {
        const results: T[] = []
        for(const rel of await this.list(undefined, options)){
            results.push(await fn(this.file(rel), rel))
        }
        return results
    }

    /**
     * Zählt die enthaltenen Dateien.
     *
     * Ordner selbst werden nicht mitgezählt, nur Dateien.
     *
     * @param options `recursive` bezieht Unterordner mit ein
     * @returns die Anzahl der Dateien
     * @example
     * ```ts
     * await dir.count({ recursive: true })
     * ```
     */
    public async count(options: DirReadOptions = {}): Promise<number> {
        return (await this.list(undefined, options)).length
    }

    /**
     * Summiert die Größe aller enthaltenen Dateien in Bytes.
     *
     * Fragt nur die Metadaten ab und liest keine Inhalte - der Speicherbedarf
     * bleibt also unabhängig von der Ordnergröße.
     *
     * @param options `recursive` bezieht Unterordner mit ein
     * @returns die Gesamtgröße in Bytes
     * @example
     * ```ts
     * const mb = (await dir.size({ recursive: true })) / 1024 / 1024
     * ```
     */
    public async size(options: DirReadOptions = {}): Promise<number> {
        let total = 0
        for(const rel of await this.list(undefined, options)){
            const stats = await fs.stat(this.resolve(rel)).catch(() => null)
            total += stats?.size ?? 0
        }
        return total
    }

    /**
     * Prüft, ob der Ordner existiert.
     *
     * Für einen Pfad, der auf eine Datei zeigt, kommt `false` zurück.
     *
     * @returns `true` wenn der Ordner da ist
     * @example
     * ```ts
     * if(!await dir.exists()) console.log("noch nicht angelegt")
     * ```
     */
    public async exists(): Promise<boolean> {
        return await dirExists(this.path)
    }

    /**
     * Prüft, ob der Ordner keine Dateien enthält.
     *
     * Leere Unterordner zählen nicht als Inhalt - gezählt werden nur Dateien.
     *
     * @returns `true` wenn keine Datei enthalten ist
     * @example
     * ```ts
     * if(await dir.isEmpty()) await dir.delete()
     * ```
     */
    public async isEmpty(): Promise<boolean> {
        return (await this.count({ recursive: true })) === 0
    }

    /**
     * Löscht den Ordner samt Inhalt.
     *
     * Die Instanz bleibt danach benutzbar: der nächste Zugriff legt den
     * Ordner neu an.
     *
     * @returns `true` bei Erfolg, sonst `false`
     * @example
     * ```ts
     * await new DirPath("build").delete()
     * ```
     */
    public async delete(): Promise<boolean> {
        await this.ready
        const removed = await deleteDir(this.path)
        this.ready = null
        return removed
    }

    /**
     * Löscht den gesamten Inhalt, behält den Ordner selbst.
     *
     * Wurde der Ordner von außen gelöscht, wird er einfach neu angelegt -
     * das Ergebnis ist dasselbe.
     *
     * @returns `true` bei Erfolg, sonst `false`
     * @example
     * ```ts
     * await new DirPath("dist").empty()   // vor dem nächsten Build
     * ```
     */
    public async empty(): Promise<boolean> {
        await this.__init()
        const root = this.resolve()
        try{
            const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => null)
            // von außen gelöscht -> einfach wieder anlegen, Ergebnis ist dasselbe
            if(!entries) return await createDir(this.path)
            for(const entry of entries){
                await fs.rm(pa.join(root, entry.name), { recursive: true, force: true })
            }
            return true
        }catch(e){
            console.error(`Fehler beim Leeren des Ordners: '${this.path}': ${e}`)
            return false
        }
    }

    /**
     * Kopiert den Ordner samt Inhalt an einen anderen Ort.
     *
     * Fehlende Zielordner werden angelegt. Das Ziel unterliegt bewusst nicht
     * der Sandbox und darf außerhalb liegen.
     *
     * @param destination Zielpfad
     * @returns `true` bei Erfolg, sonst `false`
     * @example
     * ```ts
     * await new DirPath("src").copy("backup/src")
     * ```
     */
    public async copy(destination: string): Promise<boolean> {
        await this.__init()
        return await copyDir(this.path, destination)
    }
}

/**
 * Eine einzelne Datei als Objekt.
 *
 * Die Datei wird beim ersten Zugriff automatisch angelegt - samt aller
 * fehlenden Ordner im Pfad. Ein frischer FilePath liefert also `""` statt zu
 * werfen, ein vorheriges {@link createFile} brauchst du nicht.
 *
 * Der Pfad **muss eine Dateiendung haben**. Das prüft schon der Compiler, nicht
 * erst die Laufzeit. Aus der Endung ergibt sich {@link FilePath.dataType}, und
 * damit weiß {@link FilePath.convert}, wie der Inhalt zu lesen ist - unterstützt
 * werden `json`, `csv` und `yaml`/`yml`.
 *
 * Soll die Datei garantiert innerhalb eines bestimmten Ordners liegen, erzeuge
 * sie über {@link DirPath.file} statt direkt.
 *
 * @typeParam S - der Pfad als String-Literal, damit die Endung prüfbar ist
 * @example
 * ```ts
 * const cfg = new FilePath("configs/app.json")   // legt Ordner + Datei an
 * await cfg.overwrite('{"port":3000}')
 * await cfg.update(text => ({ ...JSON.parse(text), port: 8080 }))
 * const obj = await cfg.convert()                // { port: 8080 }
 *
 * new FilePath("configs/app")                    // Compilerfehler: keine Endung
 * ```
 */
export class FilePath<S extends string = string> {
    public dataType: "json" | "csv" | "yaml" | "none"
    public path: string
    public name: string
    private fileContent: string = ""
    private ready: Promise<boolean> | null
    /**
     * Öffnet eine Datei als Objekt.
     *
     * Die Datei wird beim ersten Zugriff angelegt, fehlende Ordner ebenfalls.
     * Der Pfad muss eine Dateiendung haben - das prüft schon der Compiler.
     *
     * @param path Pfad zur Datei, relativ zum Arbeitsverzeichnis
     * @example
     * ```ts
     * const cfg = new FilePath("configs/app.json")
     * ```
     */
    constructor(path: S & FilePathInput<S>){ 
        this.path = path
        const parsed = FilePath.parse(path)
        this.name = parsed.name
        this.dataType = parsed.dataType
        this.ready = createFile(this.path, this.fileContent)
    }

    /**
     * Liest Name und Datentyp aus einem Pfad.
     *
     * Wird vom Konstruktor **und** von {@link FilePath.move} benutzt, damit
     * beide dieselbe Logik verwenden.
     *
     * @param path der zu zerlegende Pfad
     * @returns Dateiname und erkannter Datentyp
     * @example
     * ```ts
     * FilePath.parse("a/b/app.json")   // { name: "app.json", dataType: "json" }
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
     * Ein Konstruktor kann nicht async sein, deshalb merkt er sich nur das
     * Promise - hier wird darauf gewartet.
     *
     * @returns nichts - wirft nur, wenn das Anlegen scheitert
     * @example
     * ```ts
     * await this.__init()   // am Anfang jeder öffentlichen Methode
     * ```
     */
    private async __init(): Promise<void> {
        if(!this.ready) this.ready = createFile(this.path, this.fileContent)
        await this.ready
    }

    /**
     * Überschreibt die Datei komplett mit neuem Inhalt.
     *
     * Passiert in einem einzigen Schreibvorgang - es gibt also keinen Moment,
     * in dem die Datei leer oder halb geschrieben auf der Platte liegt.
     *
     * @param content der neue Inhalt
     * @returns `true` bei Erfolg, sonst `false`
     * @example
     * ```ts
     * await new FilePath("app.json").overwrite('{"port":3000}')
     * ```
     */
    public async overwrite(content:string){
        await this.__init()
        try{
            await fs.writeFile(this.path, content, 'utf-8')
            return true
        }catch(e){
            console.error(`Fehler beim Überschreiben der Datei: '${this.path}': ${e}`)
            return false
        }
    }

    /**
     * Liest den kompletten Inhalt der Datei als String.
     *
     * Die Datei wird beim ersten Zugriff automatisch angelegt, ein frischer
     * FilePath liefert also `""` statt zu werfen. wenn der pfad aber auf eine
     * schon exestierende Datei trifft, wird dessen inhalt gegeben
     *
     * @returns der Dateiinhalt
     * @example
     * ```ts
     * const text = await new FilePath("notes.txt").content()
     * ```
     */
    public async content(){
        await this.__init()
        return await readFile(this.path)
    }

    
    /**
     * Liest den Inhalt zeilenweise.
     *
     * Endet die Datei mit einem Zeilenumbruch, ist der letzte Eintrag ein
     * leerer String - genau wie bei `split("\n")`.
     *
     * @returns die Zeilen der Datei
     * @example
     * ```ts
     * for(const zeile of await log.lines()) console.log(zeile)
     * ```
     */
    public async lines(){
        await this.__init()
        return await readFileLines(this.path)
    }

    /**
     * Hängt Inhalt als neue Zeile an die Datei an.
     *
     * Bei einer leeren Datei wird kein führendes `\n` gesetzt.
     *
     * @param content der anzuhängende Text
     * @returns `true` bei Erfolg, sonst `false`
     * @example
     * ```ts
     * const log = new FilePath("app.log")
     * await log.add("Server gestartet")
     * ```
     */
    public async add(content:string){
        await this.__init()
        return await addToFile(this.path,content)
    }

    /**
     * Entfernt das **erste** Vorkommen eines Textes aus der Datei.
     *
     * Gesucht wird wörtlich, nicht als regulärer Ausdruck. Kommt der Text
     * nicht vor, bleibt die Datei unverändert.
     *
     * @param content der zu entfernende Text
     * @returns `true` bei Erfolg, sonst `false`
     * @example
     * ```ts
     * await file.remove("// TODO: aufräumen")
     * ```
     */
    public async remove(content:string){
        try{
            await this.__init()
            await this.update(inhalt => inhalt.replace(content,""))
            return true
        } catch(e){
            console.log(`Error beim Content entfernen der Datei ${this.path}: ${e}`)
            return false
        }
    }

    /**
     * Löscht die Datei.
     *
     * Die Instanz bleibt danach benutzbar: der nächste Zugriff legt die
     * Datei neu an.
     *
     * @returns `true` bei Erfolg, `false` wenn es sie gar nicht gab
     * @example
     * ```ts
     * await new FilePath("tmp/cache.json").delete()
     * ```
     */
    public async delete(){
        await this.ready
        const removed = await removeFile(this.path)
        this.ready = null
        return removed
    }

    /**
     * Kopiert die Datei an einen anderen Ort. Das Original bleibt bestehen.
     *
     * Fehlende Zielordner werden angelegt.
     *
     * @param newPath Zielpfad
     * @returns `true` bei Erfolg, sonst `false`
     * @example
     * ```ts
     * await cfg.copy("backup/app.json")
     * ```
     */
    public async copy(newPath:string){
        await this.__init()
        return await copyFile(this.path,newPath)
    }

    /**
     * Prüft, ob die Datei einen bestimmten Text enthält.
     *
     * Verglichen wird wörtlich und mit Beachtung von Groß- und
     * Kleinschreibung.
     *
     * @param content der gesuchte Text
     * @returns `true` wenn der Text vorkommt
     * @example
     * ```ts
     * if(await file.contains("console.log")) console.log("noch Debug-Code drin")
     * ```
     */
    public async contains(content:string){
        await this.__init()
        const fileContant = await this.content()
        if(fileContant.includes(content)) return true
        else return false
    }

    /**
     * Liest, verändert und speichert die Datei in einem Schritt.
     *
     * Gibt `fn` einen String zurück, wird der unverändert geschrieben. Alles
     * andere landet als eingerücktes JSON in der Datei. Wirft `fn` oder ist
     * der Wert nicht serialisierbar, bleibt die Datei unangetastet.
     *
     * @param fn bekommt den aktuellen Inhalt, gibt den neuen zurück
     * @returns `true` bei Erfolg, `false` wenn nichts geschrieben wurde
     * @example
     * ```ts
     * await file.update(text => text.toUpperCase())
     * await file.update(text => ({ ...JSON.parse(text), version: 2 }))
     * ```
     */
    public async update(fn:(content:string) => NonNullable | Promise<NonNullable>){
        await this.__init()
        try{
            const fileContent = await this.content()
            await this.overwrite(toFileContent(await fn(fileContent)))
            return true
        } catch(e){
            console.error(`Error beim updaten der Datei: ${this.path} -> ${e}`)
            return false
        }
    }

    /**
     * Prüft, ob die Datei leer ist.
     *
     * Eine Datei, die nur Leerzeichen oder Zeilenumbrüche enthält, gilt als
     * **nicht** leer.
     *
     * @returns `true` wenn die Datei keinen Inhalt hat
     * @example
     * ```ts
     * if(await file.isEmpty()) await file.add("# neu angelegt")
     * ```
     */
    public async isEmpty(){
        await this.__init()
        if((await this.content()).length === 0) return true
        else return false
    }

    /**
     * Verschiebt die Datei und richtet die Instanz auf den neuen Ort aus.
     *
     * `path`, `name` und `dataType` werden mitgezogen. Gelöscht wird erst,
     * wenn die Kopie wirklich steht - schlägt sie fehl, bleibt das Original
     * unangetastet.
     *
     * @param newPath Zielpfad
     * @returns `true` bei Erfolg, `false` wenn nichts verschoben wurde
     * @example
     * ```ts
     * const f = new FilePath("daten.json")
     * await f.move("archiv/daten.json")
     * ```
     */
    public async move(newPath:string){
        await this.__init()
        if(pa.resolve(this.path) === pa.resolve(newPath)) return true
        if(!(await this.copy(newPath))) return false
        await this.delete()
        this.path = newPath
        const parsed = FilePath.parse(newPath)
        this.name = parsed.name
        this.dataType = parsed.dataType
        return true
    }

    /**
     * Konvertiert den Dateiinhalt anhand der Endung in ein JS-Objekt.
     *
     * Unterstützt `json`, `csv` und `yaml`/`yml` - siehe
     * {@link FilePath.dataType}. CSV wird spaltenweise abgebildet:
     * `{ spalte: [wert, wert, ...] }`.
     *
     * @returns das geparste Objekt
     * @throws bei unbekannter Endung, oder wenn der Inhalt nicht geparst
     *         werden kann
     * @example
     * ```ts
     * const cfg = await new FilePath("config.json").convert()
     * ```
     */
    public async convert(){
        await this.__init()
        switch(this.dataType){
            case "json":{
                return JSON.parse(await this.content())
            }
            case "csv":{
                const rows = (await this.lines())
                    .map(row => row.replace(/\r$/, ""))
                    .filter(row => row.trim() !== "")
                if(rows.length === 0) return {}

                const split = (row:string) => row.split(",").map(cell => cell.trim())
                const headers = split(rows[0])
                const obj:Record<string,Array<string>> = {}
                for(const header of headers) obj[header] = []

                for(const row of rows.slice(1)){
                    const cells = split(row)
                    for(let i = 0; i < headers.length; i++){
                        obj[headers[i]].push(cells[i] ?? "")
                    }
                }
                return obj
            }
            case "yaml":{
                const lines = (await this.lines())
                    .map(line => line.replace(/\r$/, ""))
                    .filter(line => line.trim() !== "" && !line.trim().startsWith("#"))

                const parseValue = (raw:string):any => {
                    const value = raw.trim()
                    if(value === "" || value === "null" || value === "~") return null
                    if(value === "true") return true
                    if(value === "false") return false
                    if(/^-?\d+(\.\d+)?$/.test(value)) return Number(value)
                    if(/^".*"$/.test(value) || /^'.*'$/.test(value)) return value.slice(1, -1)
                    return value
                }

                // parst alle Zeilen die tiefer eingerückt sind als 'indent'
                const parseBlock = (index:number, indent:number):[any, number] => {
                    let i = index
                    const isList = lines[i].search(/\S/) === indent && lines[i].trim().startsWith("- ")
                    const result:any = isList ? [] : {}

                    while(i < lines.length){
                        const line = lines[i]
                        const currentIndent = line.search(/\S/)
                        if(currentIndent < indent) break

                        const content = line.trim()

                        if(Array.isArray(result)){
                            if(currentIndent > indent || !content.startsWith("- ")) break
                            result.push(parseValue(content.slice(2)))
                            i++
                            continue
                        }

                        if(currentIndent > indent){ i++; continue }

                        const separator = content.indexOf(":")
                        if(separator === -1){ i++; continue }

                        const key = content.slice(0, separator).trim()
                        const rest = content.slice(separator + 1).trim()

                        if(rest !== ""){
                            result[key] = parseValue(rest)
                            i++
                            continue
                        }

                        const nextIndent = i + 1 < lines.length ? lines[i + 1].search(/\S/) : -1
                        if(nextIndent > currentIndent || (nextIndent === currentIndent && lines[i + 1].trim().startsWith("- "))){
                            const [child, nextIndex] = parseBlock(i + 1, nextIndent)
                            result[key] = child
                            i = nextIndex
                        }else{
                            result[key] = null
                            i++
                        }
                    }

                    return [result, i]
                }

                if(lines.length === 0) return {}
                return parseBlock(0, lines[0].search(/\S/))[0]
            }
            default:
                throw new Error(`Error beim conventieren der datei: ${this.path}`)
        }
    }
}

/**
 * macht aus einem beliebigen Rückgabewert den Text, der in die Datei soll.
 * Strings bleiben wie sie sind, alles andere wird zu lesbarem JSON.
 * Bei zirkulären Objekten wirft JSON.stringify - der Aufrufer fängt das ab
 * und lässt die Datei dann lieber unangetastet.
 */
function toFileContent(value: unknown): string {
    if(typeof value === "string") return value
    if(value === undefined || value === null) return ""
    return JSON.stringify(value, null, 2) ?? String(value)
}

/**
 * Erlaubt es, den Unterpfad wegzulassen und direkt die Optionen zu übergeben:
 * `read({ recursive: true })` statt `read(undefined, { recursive: true })`.
 */
function dirArgs(subpath?: string | DirReadOptions, options: DirReadOptions = {}): [string | undefined, DirReadOptions] {
    return typeof subpath === "object" && subpath !== null ? [undefined, subpath] : [subpath, options]
}


