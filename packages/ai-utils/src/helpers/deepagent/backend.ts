import {
    StateBackend,
    FilesystemBackend,
    LocalShellBackend,
    CompositeBackend,
    type LocalShellBackendOptions,
} from "../../imports"

type Prettify<T> = {
    [K in keyof T]: T[K]
} & {}

/**
 * erstellt einfach den StateBackend von langchain
 * @example
 * export function createStateBackend() {
    return new StateBackend()
}
 */
export function createStateBackend() {
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
} = {}) {
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
} = {}) {
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
} = {}) {
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
    rootDir = process.cwd(),
    route = "/workspace/",
    virtualMode = true,
}: {
    rootDir?: string
    route?: string
    virtualMode?: boolean
} = {}) {
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
    rootDir = process.cwd(),
    route = "/workspace/",
    virtualMode = true,
    ...options
}: Prettify<LocalShellBackendOptions & { route?: string }> = {}) {
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
    route,
    rootDir = process.cwd(),
    virtualMode = true,
    ...options
}: Prettify<LocalShellBackendOptions & { route: string }>) {
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
