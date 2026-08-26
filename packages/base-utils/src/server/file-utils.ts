import * as fs from 'node:fs/promises'
import * as path from 'path'

export function getProjectRoot(): string {
    return path.resolve(import.meta.dirname, '../../../..')
}

// Files

/**
 * legt die Datei an und erstellt dabei automatisch alle fehlenden Ordner
 * aus dem Pfad. Existiert die Datei schon, passiert nichts.
 */
export async function createFile(file: string, content: string): Promise<boolean>{
    try{
        if(await fileExist(file)) return true
        await fs.mkdir(path.dirname(file), { recursive: true })
        await fs.writeFile(file, content, 'utf-8')
        return true
    }catch(e){
        console.error(`Fehler beim Erstellen der Datei: '${file}': ${e}`)
        return false
    }
}

export async function readFile(file: string): Promise<string> {
    let filePath = path.resolve(file)
    
    if (!path.isAbsolute(file)) {
        const projectRoot = getProjectRoot()
        filePath = path.join(projectRoot, file)
        
        try {
            await fs.access(filePath)
        } catch {
            filePath = path.resolve(file)
        }
    }
    
    try {
        await fs.access(filePath)
    } catch {
        throw new Error(`Datei nicht gefunden: ${file}`)
    }
    
   return await fs.readFile(filePath, 'utf-8')
}

export async function readFileLines(file: string): Promise<string[]> {
    return (await fs.readFile(file, 'utf-8')).split('\n')
}

export async function addToFile(file: string, content: string): Promise<boolean> {
    try{
        const stats = await fs.stat(file).catch(() => null)
        const isEmpty = !stats || stats.size === 0
        await fs.appendFile(file, isEmpty ? content : `\n${content}`, 'utf-8')
        return true
    }catch(e){
        console.error(`Fehler beim Hinzufügen des Inhalts zu der Datei: '${file}': ${e}`)
        return false
    }
}

export async function fileExist(file: string): Promise<boolean> {
    try {
        await fs.access(file)
        return true
    } catch {
        return false
    }
}

export async function removeFile(file: string): Promise<boolean> {
    try {
        await fs.unlink(file)
        return true
    } catch(e) {
        console.error(`Fehler beim Löschen der Datei: '${file}': ${e}`)
        return false
    }
}

export async function appendFile(file: string,data: string): Promise<boolean>{
    try{
        await fs.appendFile(file,data)
        return true
    }catch(e){
        console.error(`Fehler beim data hinzufügen zur File ${file}: ${e}`)
        return false
    }
}

export async function copyFile(source: string,destination: string): Promise<boolean>{
    try{
        await fs.mkdir(path.dirname(destination), { recursive: true })
        await fs.copyFile(source,destination)
        return true
    }catch(e){
        console.error(`Fehler beim kopieren von file ${source} zu file ${destination}: ${e}`)
        return false
    }
}

// Directorys

export async function copyDir(source: string,destination: string): Promise<boolean>{
    try{
        await fs.cp(source,destination)
        return true
    }catch(e){
        console.error(`Fehler beim kopieren von dir ${source} zu destination ${destination}: ${e}`)
        return false
    }
}

export async function createDir(dir: string): Promise<boolean>{
    try{
        await fs.mkdir(dir, { recursive: true })
        return true
    }catch(e){
        console.error(`Fehler beim Erstellen des Ordners: '${dir}': ${e}`)
        return false
    }
}

export async function dirExists(dir: string): Promise<boolean> {
    try {
        return (await fs.stat(dir)).isDirectory()
    } catch {
        return false
    }
}

export async function deleteDir(dir: string): Promise<boolean>{
    try{
        await fs.rm(dir, { recursive: true })
        return true
    }catch(e){
        console.error(`Fehler beim Löschen des Ordners: '${dir}': ${e}`)
        return false
    }
}

export interface DirFile {
    file: string
    content: string
}

export async function readDir(dir: string): Promise<DirFile[]> {
    const dirPath = path.isAbsolute(dir) ? dir : path.join(getProjectRoot(), dir)
    const files: DirFile[] = []
    
    async function _readDir(currentPath: string) {
        const entries = await fs.readdir(currentPath, { withFileTypes: true })
        
        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name)
            
            if (entry.isFile()) {
                const content = await fs.readFile(fullPath, 'utf-8')
                files.push({ file: entry.name, content })
            } else if (entry.isDirectory()) {
                await _readDir(fullPath)
            }
        }
    }
    
    await _readDir(dirPath)
    return files
}


// classes

/**
 * true, wenn das LETZTE Pfad-Segment eine Dateiendung hat.
 * "a/b/c.json" -> true | "a/b/c" -> false | "a.b/c" -> false | "a/b." -> false
 * Ein dynamischer string (kein Literal) wird durchgelassen, weil er zur
 * Compile-Zeit nicht pruefbar ist.
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
 * Input-Typ fuer new FilePath: erzwingt eine Endung im letzten Segment.
 * Bei einem Pfad ohne Endung steht die Erklaerung direkt im TS-Fehler.
 */
export type FilePathInput<S extends string> =
    HasFileExtension<S> extends true
        ? unknown
        : { __error: `'${S}' hat keine Dateiendung - ein FilePath braucht z.B. '${S}.json'` }


/**
 * macht aus einem beliebigen Rueckgabewert den Text, der in die Datei soll.
 * Strings bleiben wie sie sind, alles andere wird zu lesbarem JSON.
 * Bei zirkulaeren Objekten wirft JSON.stringify - der Aufrufer faengt das ab
 * und laesst die Datei dann lieber unangetastet.
 */
function toFileContent(value: unknown): string {
    if(typeof value === "string") return value
    if(value === undefined || value === null) return ""
    return JSON.stringify(value, null, 2) ?? String(value)
}

export class FilePath<S extends string = string> {
    public dataType: "json" | "csv" | "yaml" | "none"
    public path: string
    public name: string
    private content: string = ""
    private ready: Promise<boolean> | null
    constructor(path: S & FilePathInput<S>){ 
        this.path = path
        const parsed = FilePath.parse(path)
        this.name = parsed.name
        this.dataType = parsed.dataType
        this.ready = createFile(this.path, this.content)
    }

    /** liest name + dataType aus einem Pfad - fuer constructor und move() */
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

    /** stellt sicher, dass die Datei existiert - laeuft pro Instanz nur einmal */
    private async __init(): Promise<void> {
        if(!this.ready) this.ready = createFile(this.path, this.content)
        await this.ready
    }

    public async overwrite(content:string): Promise<boolean> {
        await this.__init()
        try{
            await fs.writeFile(this.path, content, 'utf-8')
            return true
        }catch(e){
            console.error(`Fehler beim Überschreiben der Datei: '${this.path}': ${e}`)
            return false
        }
    }

    public async read(){
        await this.__init()
        return await readFile(this.path)
    }

    public async readLines(){
        await this.__init()
        return await readFileLines(this.path)
    }

    public async add(content:string){
        await this.__init()
        return await addToFile(this.path,content)
    }

    public async remove(content:string){
        await this.__init()
        const fileContent = await this.read()
        await removeFile(this.path)
        await createFile(this.path,fileContent.replace(content,""))
    }

    public async delete(){
        await this.__init()
        const removed = await removeFile(this.path)
        this.ready = null
        return removed
    }

    public async copy(newPath:string){
        await this.__init()
        return await copyFile(this.path,newPath)
    }

    public async contains(content:string){
        await this.__init()
        const fileContant = await this.read()
        if(fileContant.includes(content)) return true
        else return false
    }

    public async update(fn:(content:string) => any){
        await this.__init()
        try{
            const fileContent = await this.read()
            await this.overwrite(toFileContent(await fn(fileContent)))
            return true
        } catch(e){
            console.error(`Error beim updaten der Datei: ${this.path} -> ${e}`)
            return false
        }
    }

    public async isEmpty(){
        await this.__init()
        if((await this.read()).length === 0) return true
        else return false
    }

    public async move(newPath:string){
        await this.__init()
        // nur loeschen, wenn die Kopie wirklich steht - sonst ist die Datei weg
        if(!(await this.copy(newPath))) return false
        await this.delete()
        this.path = newPath
        const parsed = FilePath.parse(newPath)
        this.name = parsed.name
        this.dataType = parsed.dataType
        return true
    }

    /**
     * conventiert den Datein-typ zu einem js-objekt.
     * unterstütze daten-typen = json,csv,yaml
     */
    public async convert(): Promise<any> {
        await this.__init()
        switch(this.dataType){
            case "json":{
                return JSON.parse(await this.read())
            }
            case "csv":{
                const rows = (await this.readLines())
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
                const lines = (await this.readLines())
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

                // parst alle Zeilen die tiefer eingerueckt sind als 'indent'
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
                return null
        }
    }
}

export class DirPath {
    constructor(public path:string){

    }
}


