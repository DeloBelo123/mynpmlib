export * from "./types.js"
export * from "./funcs.js"
export * from "./classes.js"

/**
 * Die alten Namen aus Version <= 1.4.0 als Alias.
 *
 * Beide Namen zeigen auf dieselbe Klasse - der Aufrufer entscheidet, ob er
 * das kurze `File` will (verdeckt in seiner Datei Node's globales `File`)
 * oder das eindeutige `FilePath`.
 *
 * @example
 * ```ts
 * import { File, Directory } from "@delofarag/base-utils/server"
 * import { FilePath, DirPath } from "@delofarag/base-utils/server"
 * import * as fsx from "@delofarag/base-utils/server"   // fsx.File verdeckt nichts
 * ```
 */
export { File as FilePath, Directory as DirPath } from "./classes.js"
