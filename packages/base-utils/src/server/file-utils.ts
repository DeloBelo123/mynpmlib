import * as fs from 'node:fs/promises'
import * as path from 'path'

function getProjectRoot(): string {
    return path.resolve(__dirname, '../../../..')
}

export async function createFile(file: string, content: string): Promise<boolean>{
    try{
        await fs.writeFile(file, content, 'utf-8')
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
    
   return await fs.readFile(filePath, 'utf-8')
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
            } else if (entry.isDirectory()) {
                await readDir(fullPath)
            }
        }
    }
    
    await readDir(dirPath)
    return files
}

export async function readFileLines(file: string): Promise<string[]> {
    return (await fs.readFile(file, 'utf-8')).split('\n')
}

export async function addToFile(file: string, content: string): Promise<boolean> {
    try{
        await fs.appendFile(file, `\n${content}`, 'utf-8')
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
        await fs.copyFile(source,destination)
        return true
    }catch(e){
        console.error(`Fehler beim kopieren von file ${source} zu file ${destination}: ${e}`)
        return false
    }
}

export async function copyDir(source: string,destination: string): Promise<boolean>{
    try{
        await fs.cp(source,destination)
        return true
    }catch(e){
        console.error(`Fehler beim kopieren von dir ${source} zu destination ${destination}: ${e}`)
        return false
    }
}


