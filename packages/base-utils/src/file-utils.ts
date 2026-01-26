import * as fs from 'fs/promises'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

function getProjectRoot(): string {
    return path.resolve(__dirname, '../../../..')
}

// creating and reading
export async function createFile(file: string, content: string): Promise<boolean>{
    try{
        await fs.writeFile(file, content, 'utf-8')
        console.log(`die Datei: '${file}' wurde erstellt`)
        return true
    }catch(e){
        console.error(`Fehler beim Erstellen der Datei: '${file}': ${e}`)
        return false
    }
}

export async function createSubFile(pathStr: string, content: string): Promise<boolean> {
    const dir = path.dirname(pathStr)
    try{
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(pathStr, content, 'utf-8')
        console.log(`der Tree: '${pathStr}' wurde erstellt`)
        return true
    }catch(e){
        console.error(`Fehler beim Erstellen der Datei: '${pathStr}': ${e}`)
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
    
    const content = await fs.readFile(filePath, 'utf-8')
    console.log(`die Datei: '${filePath}' wurde ausgelesen`)
    return content
}

export async function readAllFilesInDir(dir: string): Promise<string[]> {
    const dirPath = path.join(getProjectRoot(), dir)
    const files: string[] = []
    
    async function readDir(currentPath: string) {
        const entries = await fs.readdir(currentPath, { withFileTypes: true })
        
        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name)
            
            if (entry.isFile()) {
                const content = await fs.readFile(fullPath, 'utf-8')
                files.push(content)
                console.log(`die Datei: '${fullPath}' wurde ausgelesen`)
            } else if (entry.isDirectory()) {
                await readDir(fullPath)
            }
        }
    }
    
    await readDir(dirPath)
    console.log(`der ordner: ${dir} wurde vollständig ausgelesen`)
    return files
}

export async function readFileLines(file: string): Promise<string[]> {
    const content = await fs.readFile(file, 'utf-8')
    const lines = content.split('\n')
    console.log(`die Datei: '${file}' wurde Zeile für Zeile ausgelesen und in ein array gepackt`)
    return lines
}

export async function addToFile(file: string, content: string): Promise<boolean> {
    try{
        await fs.appendFile(file, `\n${content}`, 'utf-8')
        console.log(`in Datei: '${file}' wurde Inhalt: '${content}' hinzugefügt`)
        return true
    }catch(e){
        console.error(`Fehler beim Hinzufügen des Inhalts zu der Datei: '${file}': ${e}`)
        return false
    }
}

export async function doesFileExist(file: string): Promise<boolean> {
    try {
        await fs.access(file)
        console.log(`die Datei: '${file}' exestiert`)
        return true
    } catch {
        console.log(`die Datei: '${file}' exestiert nicht`)
        return false
    }
}

// running code
export async function write_n_run(
    file: string,
    content: string,
    interpreter: string,
    is_subfile: boolean = false,
    ausführen: boolean = false
): Promise<string> {
    const filePath = path.resolve(file)
    
    if (is_subfile) {
        const dir = path.dirname(filePath)
        await fs.mkdir(dir, { recursive: true })
    }
    
    await fs.writeFile(filePath, content, 'utf-8')
    console.log(`die ${interpreter} Code-Datei: '${file}' wurde erstellt`)
    
    if (ausführen) {
        await execAsync(`${interpreter} ${filePath}`)
        console.log(`die ${interpreter} Code-Datei: '${file}' wird ausgeführt`)
    }
    
    return filePath
}

export async function write_n_run_py(
    file: string,
    content: string,
    is_subfile: boolean = false,
    aus_führen: boolean = false
): Promise<string> {
    return write_n_run(file, content, 'python3', is_subfile, aus_führen)
}

export async function write_n_run_js(
    file: string,
    content: string,
    is_subfile: boolean = false,
    aus_führen: boolean = false
): Promise<string> {
    return write_n_run(file, content, 'node', is_subfile, aus_führen)
}

// removing
export async function removeFile(file: string): Promise<boolean> {
    try {
        await fs.unlink(file)
        console.log(`die Datei: '${file}' wurde gelöscht`)
        return true
    } catch(e) {
        // Datei existiert nicht oder kann nicht gelöscht werden
        console.error(`Fehler beim Löschen der Datei: '${file}': ${e}`)
        return false
    }
}

