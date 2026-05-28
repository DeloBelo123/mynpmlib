import {
    StateBackend,
    FilesystemBackend,
    LocalShellBackend,
    CompositeBackend,
    type CreateDeepAgentParams,
    type LocalShellBackendOptions,
} from "../../imports"
import type { ExecuteCapableDeepAgentBackend } from "./interruptOn"

/** Native deepagents-Backend — Instanz oder Factory, kein Promise. */
export type DeepAgentBackend = NonNullable<CreateDeepAgentParams["backend"]>

type Prettify<T> = {
    [K in keyof T]: T[K]
} & {}

export type CreateLocalShellBackendOptions = Prettify<
    Omit<LocalShellBackendOptions, "rootDir"> & {
        route?: string
        rootDir: string
    }
>

/**
 * erstellt einfach den StateBackend von langchain
 * @example
 * export function createStateBackend() {
    return new StateBackend()
}
 */
export function createStateBackend(): StateBackend {
    return new StateBackend()
}

/**
 * erstellt ein reines Filesystembackend, nimm lieber 'createWorkspaceBackend()'
 * @example
 * export function createFilesystemBackend({
    rootDir = process.cwd(),
    virtualMode = true,
    maxFileSizeMb,
}: {
    rootDir?: string
    virtualMode?: boolean
    maxFileSizeMb?: number
} = {}): FilesystemBackend {
    return new FilesystemBackend({ rootDir, virtualMode, maxFileSizeMb })
}
 */
export function createFilesystemBackend({
    rootDir = process.cwd(),
    virtualMode = true,
    maxFileSizeMb,
}: {
    rootDir?: string
    virtualMode?: boolean
    maxFileSizeMb?: number
} = {}): FilesystemBackend {
    return new FilesystemBackend({ rootDir, virtualMode, maxFileSizeMb })
}

/**
 * erstellt ein Filesystembackend mit einem normalem Statebackend damit dein workspace nicht beschmutzt wird
 * @example
 * export function createWorkspaceBackend({
    rootDir = process.cwd(),
    route = "/workspace/",
    virtualMode = true,
}: {
    rootDir?: string
    route?: string
    virtualMode?: boolean
} = {}): FilesystemBackend {
    const normalizedRoute = route.endsWith("/") ? route : `${route}/`
    return new CompositeBackend(
        new StateBackend(), 
        {
            [normalizedRoute]: new FilesystemBackend({ rootDir, virtualMode }),
        }
    )
}
 */
export function createWorkspaceBackend({
    rootDir,
    virtualMode = true,
    route = "/workspace/",
}: {
    rootDir: string
    route?: string
    virtualMode?: boolean
}): CompositeBackend {
    const normalizedRoute = route.endsWith("/") ? route : `${route}/`
    return new CompositeBackend(
        new StateBackend(), 
        {
            [normalizedRoute]: new FilesystemBackend({ rootDir, virtualMode }),
        }
    )
}

/**
 * LocalShell unter route (default /workspace/) + StateBackend für interne Agent-Dateien.
 * execute() läuft weiter auf dem Host — nur für Dev.
 * @example
 * export async function createLocalShellBackend({
    rootDir,
    route = "/workspace/",
    virtualMode = true,
    ...options
}: CreateLocalShellBackendOptions) {
    const normalizedRoute = route.endsWith("/") ? route : `${route}/`
    const shellBackend = await LocalShellBackend.create({
        rootDir,
        virtualMode,
        ...options,
    })
    return new CompositeBackend(
        new StateBackend(), 
        {
            [normalizedRoute]: shellBackend,
        }
    )
}
 */
export async function createLocalShellBackend({
    rootDir,
    route = "/workspace/",
    virtualMode = true,
    ...options
}: CreateLocalShellBackendOptions): Promise<CompositeBackend & ExecuteCapableDeepAgentBackend> {
    const normalizedRoute = route.endsWith("/") ? route : `${route}/`
    const shellBackend = await LocalShellBackend.create({
        rootDir,
        virtualMode,
        ...options,
    })
    const backend = new CompositeBackend(
        new StateBackend(), 
        {
            [normalizedRoute]: shellBackend,
        }
    )
    return Object.assign(backend, { __deepAgentExecute: true as const })
}
