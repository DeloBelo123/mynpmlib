import * as fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import * as pa from 'path'
import { DirFile, DirReadOptions, FsError, rethrow } from './types.js'

/** Standard-Obergrenze pro Datei beim Einlesen: 50 MB */
export const MAX_FILE_SIZE = 50 * 1024 * 1024

/**
 * Gibt das aktuelle Arbeitsverzeichnis zurück - die Basis, gegen die alle
 * relativen Pfade in diesem Modul aufgelöst werden.
 */
export function cwd(): string {
    return process.cwd()
}

/**
 * Prüft, ob `target` innerhalb von `root` liegt.
 *
 * Auf Windows und macOS wird für den Vergleich klein geschrieben, weil deren
 * Dateisysteme Groß- und Kleinschreibung nicht unterscheiden - ein reiner
 * String-Vergleich würde `C:\Data` und `c:\data` fälschlich trennen. Verglichen
 * wird gegen `root` **plus Trennzeichen**, sonst gälte "/data-alt" als Treffer
 * für "/data".
 *
 * @param root der äußere Ordner, absolut
 * @param target der zu prüfende Pfad, absolut
 * @returns `true` wenn `target` gleich `root` ist oder darunter liegt
 * @example
 * ```ts
 * isInside("/data", "/data/a.txt")   // true
 * isInside("/data", "/data-alt/x")   // false
 * ```
 */
export function isInside(root: string, target: string): boolean {
    const egal = process.platform === "win32" || process.platform === "darwin"
    const r = egal ? root.toLowerCase() : root
    const t = egal ? target.toLowerCase() : target
    return t === r || t.startsWith(r.endsWith(pa.sep) ? r : r + pa.sep)
}

/** Prüft einen relativen Pfad gegen die `ignore`-Muster. */
function istIgnoriert(relPath: string, muster: (string | RegExp)[]): boolean {
    return muster.some(m => typeof m === "string" ? relPath.includes(m) : m.test(relPath))
}

// Files

/**
 * Legt die Datei an und erstellt dabei automatisch alle fehlenden Ordner aus
 * dem Pfad. Existiert die Datei schon, passiert nichts.
 *
 * @param path Pfad zur Datei
 * @param content der Inhalt, mit dem sie angelegt wird
 * @throws {FsError} bei Rechteproblemen (`EACCES`), vollem Datenträger (`ENOSPC`)
 * @example
 * ```ts
 * await createFile("configs/app.json", "{}")
 * ```
 */
export async function createFile(path: string, content: string): Promise<void>{
    if(await fileExist(path)) return
    await fs.mkdir(pa.dirname(path), { recursive: true })
        .catch(rethrow("createFile", path, "Fehler beim Erstellen des Ordners"))
    await fs.writeFile(path, content, 'utf-8')
        .catch(rethrow("createFile", path, "Fehler beim Erstellen der Datei"))
}

/**
 * Liest den kompletten Inhalt einer Datei.
 *
 * @param path Pfad zur Datei
 * @param maxSize Obergrenze in Bytes, Standard {@link MAX_FILE_SIZE}
 * @returns der Dateiinhalt
 * @throws {FsError} `ENOENT` wenn es die Datei nicht gibt, oder wenn sie das
 *         Grössenlimit überschreitet
 * @example
 * ```ts
 * const text = await readFile("notes.txt")
 * ```
 */
export async function readFile(path: string, maxSize: number = MAX_FILE_SIZE): Promise<string> {
    const filePath = pa.resolve(path)

    const stats = await fs.stat(filePath).catch(() => null)
    if(stats && stats.size > maxSize){
        throw new FsError("readFile", path,
            `Datei ist ${stats.size} Bytes gross und überschreitet das Limit von ${maxSize} Bytes ` +
            `(anpassbar über maxFileSize bzw. maxSize)`)
    }

    return await fs.readFile(filePath, 'utf-8')
        .catch(rethrow("readFile", path, "Datei nicht gefunden"))
}

/**
 * Liest den Inhalt einer Datei zeilenweise.
 *
 * Getrennt wird an `\n`, `\r\n` oder `\r` - das Zeilenende der Datei spielt
 * also keine Rolle und es bleiben keine `\r` an den Zeilen hängen.
 *
 * @param path Pfad zur Datei
 * @returns die Zeilen der Datei
 * @throws {FsError} wenn die Datei nicht gelesen werden kann
 * @example
 * ```ts
 * const zeilen = await readFileLines("app.log")
 * ```
 */
export async function readFileLines(path: string): Promise<string[]> {
    return (await readFile(path)).split(/\r\n|\r|\n/)
}

/**
 * Hängt Inhalt als neue Zeile an eine Datei an.
 *
 * Bei einer leeren oder noch nicht vorhandenen Datei wird kein führendes `\n`
 * gesetzt.
 *
 * @param path Pfad zur Datei
 * @param content der anzuhängende Text
 * @throws {FsError} wenn nicht geschrieben werden kann
 * @example
 * ```ts
 * await addToFile("app.log", "Server gestartet")
 * ```
 */
export async function addToFile(path: string, content: string): Promise<void> {
    const stats = await fs.stat(path).catch(() => null)
    const isEmpty = !stats || stats.size === 0
    await fs.appendFile(path, isEmpty ? content : `\n${content}`, 'utf-8')
        .catch(rethrow("addToFile", path, "Fehler beim Hinzufügen des Inhalts"))
}

/**
 * Prüft, ob ein Pfad existiert.
 *
 * Antwortet auch für Ordner mit `true` - für "ist es wirklich eine Datei"
 * gibt es {@link dirExists} als Gegenprobe.
 *
 * @param path zu prüfender Pfad
 * @returns `true` wenn der Pfad existiert
 * @example
 * ```ts
 * const vorhanden = await fileExist("app.json")
 * ```
 */
export async function fileExist(path: string): Promise<boolean> {
    try {
        await fs.access(path)
        return true
    } catch {
        return false
    }
}

/**
 * Löscht eine Datei.
 *
 * Idempotent: existierte die Datei gar nicht, ist das kein Fehler - das Ziel
 * "Datei ist weg" ist ja erreicht.
 *
 * @param path Pfad zur Datei
 * @throws {FsError} bei Rechteproblemen oder wenn der Pfad ein Ordner ist
 * @example
 * ```ts
 * await removeFile("tmp/cache.json")
 * ```
 */
export async function removeFile(path: string): Promise<void> {
    await fs.rm(path, { force: true })
        .catch(rethrow("removeFile", path, "Fehler beim Löschen der Datei"))
}

/**
 * Hängt Daten roh an eine Datei an, ohne Zeilenumbruch davor.
 *
 * @deprecated Nutze {@link addToFile} - das kümmert sich um den Zeilenumbruch.
 * @param path Pfad zur Datei
 * @param data die anzuhängenden Daten
 * @throws {FsError} wenn nicht geschrieben werden kann
 * @example
 * ```ts
 * await appendFile("app.log", "roh")
 * ```
 */
export async function appendFile(path: string, data: string): Promise<void>{
    await fs.appendFile(path, data)
        .catch(rethrow("appendFile", path, "Fehler beim Anhängen der Daten"))
}

/**
 * Kopiert eine Datei. Fehlende Zielordner werden angelegt.
 *
 * @param source Quellpfad
 * @param destination Zielpfad
 * @param overwrite ob ein vorhandenes Ziel überschrieben wird, Standard `true`
 * @throws {FsError} `EEXIST` wenn das Ziel existiert und `overwrite` false ist
 * @example
 * ```ts
 * await copyFile("app.json", "backup/app.json", { overwrite: false })
 * ```
 */
export async function copyFile(
    source: string,
    destination: string,
    { overwrite = true }: { overwrite?: boolean } = {},
): Promise<void>{
    await fs.mkdir(pa.dirname(destination), { recursive: true })
        .catch(rethrow("copyFile", destination, "Fehler beim Erstellen des Zielordners"))
    await fs.copyFile(source, destination, overwrite ? 0 : fsConstants.COPYFILE_EXCL)
        .catch(rethrow("copyFile", source, `Fehler beim Kopieren nach '${destination}'`))
}

// Directorys

/**
 * Kopiert einen Ordner samt Inhalt. Fehlende Zielordner werden angelegt.
 *
 * @param source Quellordner
 * @param destination Zielpfad
 * @param overwrite ob vorhandene Dateien im Ziel überschrieben werden, Standard `true`
 * @throws {FsError} wenn nicht kopiert werden kann
 * @example
 * ```ts
 * await copyDir("src", "backup/src")
 * ```
 */
export async function copyDir(
    source: string,
    destination: string,
    { overwrite = true }: { overwrite?: boolean } = {},
): Promise<void>{
    await fs.cp(source, destination, { recursive: true, force: overwrite, errorOnExist: !overwrite })
        .catch(rethrow("copyDir", source, `Fehler beim Kopieren nach '${destination}'`))
}

/**
 * Legt einen Ordner an, samt aller fehlenden Zwischenordner.
 *
 * Existiert er schon, passiert nichts.
 *
 * @param path Pfad zum Ordner
 * @throws {FsError} bei Rechteproblemen
 * @example
 * ```ts
 * await createDir("build/assets")
 * ```
 */
export async function createDir(path: string): Promise<void>{
    await fs.mkdir(path, { recursive: true })
        .catch(rethrow("createDir", path, "Fehler beim Erstellen des Ordners"))
}

/**
 * Prüft, ob ein Pfad ein existierender Ordner ist.
 *
 * Für eine Datei kommt `false` zurück, nicht nur für "gibt es nicht".
 *
 * @param path zu prüfender Pfad
 * @returns `true` wenn es ein Ordner ist
 * @example
 * ```ts
 * if(await dirExists("build")) await deleteDir("build")
 * ```
 */
export async function dirExists(path: string): Promise<boolean> {
    try {
        return (await fs.stat(path)).isDirectory()
    } catch {
        return false
    }
}

/**
 * Löscht einen Ordner samt Inhalt.
 *
 * Idempotent: gab es den Ordner nicht, ist das kein Fehler.
 *
 * @param path Pfad zum Ordner
 * @throws {FsError} bei Rechteproblemen
 * @example
 * ```ts
 * await deleteDir("build")
 * ```
 */
export async function deleteDir(path: string): Promise<void>{
    await fs.rm(path, { recursive: true, force: true })
        .catch(rethrow("deleteDir", path, "Fehler beim Löschen des Ordners"))
}

/**
 * Läuft einen Ordner ab und ruft `beiDatei` für jede gefundene Datei auf.
 *
 * Symlinks werden aufgelöst: zeigt einer auf eine Datei, zählt er als Datei;
 * zeigt er auf einen Ordner, wird **nicht** hineingelaufen (sonst könnte eine
 * Schleife den Lauf nie beenden); ins Leere zeigende werden übersprungen.
 * FIFOs und Sockets werden ebenfalls übersprungen - ein Lesen darauf würde
 * dauerhaft blockieren.
 *
 * @internal
 */
async function walk(
    dirPath: string,
    recursive: boolean,
    ignore: (string | RegExp)[],
    beiDatei: (fullPath: string, relPath: string) => Promise<void>,
): Promise<void> {
    async function lauf(currentPath: string): Promise<void> {
        const entries = await fs.readdir(currentPath, { withFileTypes: true })
            .catch(rethrow("readDir", currentPath, "Fehler beim Lesen des Ordners"))

        for (const entry of entries) {
            const fullPath = pa.join(currentPath, entry.name)
            const relPath = pa.relative(dirPath, fullPath)
            if(ignore.length && istIgnoriert(relPath, ignore)) continue

            let istDatei = entry.isFile()
            let istOrdner = entry.isDirectory()

            if(entry.isSymbolicLink()){
                const ziel = await fs.stat(fullPath).catch(() => null)
                if(!ziel) continue                     // zeigt ins Leere
                istDatei = ziel.isFile()
                istOrdner = false                      // Zielordner nicht betreten: Zyklusgefahr
            }

            if(istDatei) await beiDatei(fullPath, relPath)
            else if(istOrdner && recursive) await lauf(fullPath)
        }
    }
    await lauf(dirPath)
}

/**
 * Liest die Dateien eines Ordners samt Inhalt.
 *
 * Symlinks auf Dateien werden mitgelesen, Symlinks auf Ordner nicht betreten.
 * Achtung: der komplette Inhalt landet im Speicher - bei grossen Bäumen ist
 * {@link listDir} die richtige Wahl.
 *
 * @param path der Ordner
 * @param options `recursive`, `maxFileSize` und `ignore`
 * @returns pro Datei den Pfad relativ zu `path` und den Inhalt
 * @throws {FsError} wenn der Ordner nicht existiert oder eine Datei zu gross ist
 * @example
 * ```ts
 * const dateien = await readDir("src", { recursive: true, ignore: [/node_modules/] })
 * ```
 */
export async function readDir(
    path: string,
    { recursive = false, maxFileSize = MAX_FILE_SIZE, ignore = [] }: DirReadOptions = {},
): Promise<DirFile[]> {
    const dirPath = pa.resolve(path)
    if(!(await dirExists(dirPath))) throw new FsError("readDir", path, "Ordner nicht gefunden")
    const files: DirFile[] = []

    await walk(dirPath, recursive, ignore, async (fullPath, relPath) => {
        const stats = await fs.stat(fullPath).catch(() => null)
        if(stats && stats.size > maxFileSize){
            throw new FsError("readDir", fullPath,
                `Datei ist ${stats.size} Bytes gross und überschreitet das Limit von ` +
                `${maxFileSize} Bytes (anpassbar über die Option maxFileSize)`)
        }
        const content = await fs.readFile(fullPath, 'utf-8')
            .catch(rethrow("readDir", fullPath, "Fehler beim Lesen der Datei"))
        files.push({ path: relPath, content })
    })

    return files
}

/**
 * Wie {@link readDir}, lädt aber keine Inhalte - nur die Pfade.
 *
 * Für grosse Ordner die richtige Wahl, weil nichts in den Speicher geladen wird.
 *
 * @param path der Ordner
 * @param options `recursive` und `ignore`
 * @returns die Pfade relativ zu `path`
 * @throws {FsError} wenn der Ordner nicht existiert
 * @example
 * ```ts
 * const pfade = await listDir("src", { recursive: true })
 * ```
 */
export async function listDir(
    path: string,
    { recursive = false, ignore = [] }: DirReadOptions = {},
): Promise<string[]> {
    const dirPath = pa.resolve(path)
    if(!(await dirExists(dirPath))) throw new FsError("listDir", path, "Ordner nicht gefunden")
    const paths: string[] = []
    await walk(dirPath, recursive, ignore, async (_full, relPath) => { paths.push(relPath) })
    return paths
}
