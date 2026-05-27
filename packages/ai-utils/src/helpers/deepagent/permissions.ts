import type { FilesystemPermission } from "../../imports"

/**
 * Statische Filesystem-Regeln für DeepAgent (`permissions`-Prop).
 *
 * Das ist **kein** `interruptOn` — kein User-Dialog, keine Pause.
 * Regeln gelten nur für Filesystem-Tools: `ls`, `read_file`, `write_file`,
 * `edit_file`, `glob`, `grep`. Custom-Tools (z.B. `getCandidates`) sind nicht betroffen.
 *
 * Auswertung: Regeln in Reihenfolge, erste passende Regel gewinnt.
 * Kein Match → Zugriff erlaubt (permissive default).
 *
 * Pfade: absolute Globs ab `/` (z.B. `/workspace/**`, `/**`).
 */

/**
 * Erlaubt Lesen (`read`) auf den angegebenen Pfad-Globs.
 * Betrifft: `ls`, `read_file`, `glob`, `grep`.
 *
 * @example
 * allowRead(["/candidates/**", "/workspace/**"])
 */
export function allowRead(paths: string[]): FilesystemPermission {
    return { operations: ["read"], paths, mode: "allow" }
}

/**
 * Blockiert Lesen (`read`) auf den angegebenen Pfad-Globs.
 * Betrifft: `ls`, `read_file`, `glob`, `grep`.
 *
 * @example
 * denyRead(["/secrets/**", "/**"])
 */
export function denyRead(paths: string[]): FilesystemPermission {
    return { operations: ["read"], paths, mode: "deny" }
}

/**
 * Erlaubt Schreiben (`write`) auf den angegebenen Pfad-Globs.
 * Betrifft: `write_file`, `edit_file`.
 *
 * @example
 * allowWrite(["/workspace/**"])
 */
export function allowWrite(paths: string[]): FilesystemPermission {
    return { operations: ["write"], paths, mode: "allow" }
}

/**
 * Blockiert Schreiben (`write`) auf den angegebenen Pfad-Globs.
 * Betrifft: `write_file`, `edit_file`.
 *
 * @example
 * denyWrite(["/**"])
 */
export function denyWrite(paths: string[]): FilesystemPermission {
    return { operations: ["write"], paths, mode: "deny" }
}

/**
 * Standard-Preset: lesen + schreiben nur unter `route` (default `/workspace/`),
 * überall sonst lesen und schreiben verboten.
 *
 * Sinnvoll zusammen mit `createWorkspaceBackend()` — Agent darf nur
 * im Workspace arbeiten, interne State-Pfade bleiben unberührt.
 *
 * @example
 * permissions: workspacePermissions()
 * permissions: workspacePermissions("/projects/my-app/")
 */
export function workspacePermissions(route = "/workspace/"): FilesystemPermission[] {
    const normalizedRoute = route.endsWith("/") ? route : `${route}/`
    return [
        { operations: ["read", "write"], paths: [`${normalizedRoute}**`], mode: "allow" },
        { operations: ["read"], paths: ["/**"], mode: "deny" },
        { operations: ["write"], paths: ["/**"], mode: "deny" },
    ]
}
