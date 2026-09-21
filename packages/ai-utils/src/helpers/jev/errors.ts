/**
 * Signals that a selected tool cannot run because one runtime parameter has no
 * available options. This is a domain outcome, unlike malformed `params`
 * output, which throws a `TypeError`.
 */
export class JevNoParamOptionsError extends Error {
    readonly code = "JEV_NO_PARAM_OPTIONS" as const
    readonly toolName: string
    readonly parameterName: string

    constructor(toolName: string, parameterName: string) {
        super(
            `Runtime parameter "${parameterName}" for tool "${toolName}" has no candidates`,
        )
        this.name = "JevNoParamOptionsError"
        this.toolName = toolName
        this.parameterName = parameterName
        Object.setPrototypeOf(this, new.target.prototype)
    }
}
