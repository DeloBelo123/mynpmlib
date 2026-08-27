import * as fs from 'node:fs/promises'
import * as pa from 'path'
import { DirFile } from './types.js'

export function cwd(): string {
    return process.cwd()
}

// Files

/**
 * legt die Datei an und erstellt dabei automatisch alle fehlenden Ordner
 * aus dem Pfad. Existiert die Datei schon, passiert nichts.
 */
export async function createFile(path: string, content: string): Promise<boolean>{
    try{
        if(await fileExist(path)) return true
        await fs.mkdir(pa.dirname(path), { recursive: true })
        await fs.writeFile(path, content, 'utf-8')
        return true
    }catch(e){
        console.error(`Fehler beim Erstellen der Datei: '${path}': ${e}`)
        return false
    }
}

export async function readFile(path: string): Promise<string> {
    const filePath = pa.resolve(path)

    try {
        await fs.access(filePath)
    } catch {
        throw new Error(`Datei nicht gefunden: ${path}`)
    }

    return await fs.readFile(filePath, 'utf-8')
}

export async function readFileLines(path: string): Promise<string[]> {
    return (await fs.readFile(path, 'utf-8')).split('\n')
}

export async function addToFile(path: string, content: string): Promise<boolean> {
    try{
        const stats = await fs.stat(path).catch(() => null)
        const isEmpty = !stats || stats.size === 0
        await fs.appendFile(path, isEmpty ? content : `\n${content}`, 'utf-8')
        return true
    }catch(e){
        console.error(`Fehler beim Hinzufügen des Inhalts zu der Datei: '${path}': ${e}`)
        return false
    }
}

export async function fileExist(path: string): Promise<boolean> {
    try {
        await fs.access(path)
        return true
    } catch {
        return false
    }
}

export async function removeFile(path: string): Promise<boolean> {
    try {
        await fs.unlink(path)
        return true
    } catch(e) {
        console.error(`Fehler beim Löschen der Datei: '${path}': ${e}`)
        return false
    }
}

export async function appendFile(path: string,data: string): Promise<boolean>{
    try{
        await fs.appendFile(path,data)
        return true
    }catch(e){
        console.error(`Fehler beim data hinzufügen zur File ${path}: ${e}`)
        return false
    }
}

export async function copyFile(source: string,destination: string): Promise<boolean>{
    try{
        await fs.mkdir(pa.dirname(destination), { recursive: true })
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
        await fs.cp(source,destination,{ recursive: true })
        return true
    }catch(e){
        console.error(`Fehler beim kopieren von path ${source} zu destination ${destination}: ${e}`)
        return false
    }
}

export async function createDir(path: string): Promise<boolean>{
    try{
        await fs.mkdir(path, { recursive: true })
        return true
    }catch(e){
        console.error(`Fehler beim Erstellen des Ordners: '${path}': ${e}`)
        return false
    }
}

export async function dirExists(path: string): Promise<boolean> {
    try {
        return (await fs.stat(path)).isDirectory()
    } catch {
        return false
    }
}

export async function deleteDir(path: string): Promise<boolean>{
    try{
        await fs.rm(path, { recursive: true })
        return true
    }catch(e){
        console.error(`Fehler beim Löschen des Ordners: '${path}': ${e}`)
        return false
    }
}

/**
 * Liest die Dateien eines Ordners samt Inhalt.
 *
 * @param path der Ordner
 * @param recursive auch Unterordner mitlesen (Standard: nur die oberste Ebene)
 * @returns pro Datei den Pfad relativ zu `path` und den Inhalt
 * @throws wenn der Ordner nicht existiert
 */
export async function readDir(path: string,{ recursive = false }:{ recursive?:boolean } = {}): Promise<DirFile[]> {
    const dirPath = pa.resolve(path)
    if(!(await dirExists(dirPath))) throw new Error(`Ordner nicht gefunden: ${path}`)
    const files: DirFile[] = []
    
    async function _readDir(currentPath: string) {
        const entries = await fs.readdir(currentPath, { withFileTypes: true })
        
        for (const entry of entries) {
            const fullPath = pa.join(currentPath, entry.name)
            
            if (entry.isFile()) {
                const content = await fs.readFile(fullPath, 'utf-8')
                files.push({ path: pa.relative(dirPath, fullPath), content })
            } else if (entry.isDirectory() && recursive) {
                await _readDir(fullPath)
            }
        }
    }
    
    await _readDir(dirPath)
    return files
}

/**
 * Wie {@link readDir}, laedt aber keine Inhalte - nur die Pfade.
 * Fuer grosse Ordner die richtige Wahl.
 */
export async function listDir(path: string,{ recursive = false }:{ recursive?:boolean } = {}): Promise<string[]> {
    const dirPath = pa.resolve(path)
    if(!(await dirExists(dirPath))) throw new Error(`Ordner nicht gefunden: ${path}`)
    const paths: string[] = []

    async function _listDir(currentPath: string) {
        const entries = await fs.readdir(currentPath, { withFileTypes: true })

        for (const entry of entries) {
            const fullPath = pa.join(currentPath, entry.name)

            if (entry.isFile()) {
                paths.push(pa.relative(dirPath, fullPath))
            } else if (entry.isDirectory() && recursive) {
                await _listDir(fullPath)
            }
        }
    }

    await _listDir(dirPath)
    return paths
}