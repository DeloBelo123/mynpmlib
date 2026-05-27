import type { CreateDeepAgentParams } from "../../imports"

export type InterruptOn = NonNullable<CreateDeepAgentParams["interruptOn"]>
export type InterruptDecision = "approve" | "edit" | "reject"

type ToolCallLike = { name: string; args: Record<string, unknown> }
type InterruptDescription = string | ((toolCall: ToolCallLike) => string | Promise<string>)

/**
 * Human-in-the-Loop (`interruptOn`-Prop) — pausiert den Agent **vor** Tool-Ausführung.
 *
 * Das ist **kein** `permissions`-Filesystem-ACL. Keys sind **Tool-Namen** (exakt wie
 * beim `tool({ name: "..." })`). Tools die nicht in der Map stehen, laufen ohne Pause.
 *
 * Braucht `checkpointer` + `thread_id`. Es gibt keine eingebaute UI — du bekommst
 * `result.__interrupt__` und zeigst `actionRequests[].description` selbst an.
 * Fortsetzen mit `Command({ resume: { decisions: [...] } })`.
 */

/**
 * Pause vor Tool-Ausführung. User darf approve, edit und reject.
 * Default-Text: "Tool execution requires approval" + Tool-Name + Args.
 *
 * @example
 * interruptOn: {
 *     ...requireApproval("getCandidates", "deleteCandidate"),
 * }
 */
export function requireApproval(...toolNames: string[]): InterruptOn {
    return Object.fromEntries(toolNames.map((name) => [name, true]))
}

/**
 * Tool explizit ohne Pause — läuft sofort durch.
 * Nützlich wenn du viele Tools pausieren willst und einzelne ausnahmen musst.
 *
 * @example
 * interruptOn: {
 *     ...requireApproval("getCandidates"),
 *     ...autoApprove("ping"),
 * }
 */
export function autoApprove(...toolNames: string[]): InterruptOn {
    return Object.fromEntries(toolNames.map((name) => [name, false]))
}

/**
 * Pause mit eigenem Text. User darf nur approve oder reject (kein edit).
 * Typisch für sensible Aktionen: Daten lesen, löschen, versenden.
 *
 * @example
 * interruptOn: {
 *     ...approveOrReject(
 *         "getCandidates",
 *         "Der Agent möchte Bewerberdaten abrufen. Erlauben?",
 *     ),
 * }
 */
export function approveOrReject(toolName: string, description?: string): InterruptOn {
    return {
        [toolName]: {
            allowedDecisions: ["approve", "reject"],
            ...(description ? { description } : {}),
        },
    }
}

/**
 * Pause mit voller Kontrolle über Text und erlaubte User-Entscheidungen.
 *
 * @example
 * interruptOn: {
 *     ...requireApprovalWithDescription(
 *         "updateCandidateStatus",
 *         "Status-Änderung bestätigen?",
 *         ["approve", "reject"],
 *     ),
 * }
 */
export function requireApprovalWithDescription(
    toolName: string,
    description: InterruptDescription,
    allowedDecisions: InterruptDecision[] = ["approve", "edit", "reject"],
): InterruptOn {
    return {
        [toolName]: {
            allowedDecisions,
            description,
        },
    }
}

/**
 * Pause mit Prefix-Text + Tool-Args als JSON (dynamisch pro Call).
 *
 * @example
 * interruptOn: {
 *     ...withToolArgsDescription(
 *         "getCandidates",
 *         "Der Agent möchte Bewerber abrufen:",
 *     ),
 * }
 */
export function withToolArgsDescription(
    toolName: string,
    prefix: string,
    allowedDecisions: InterruptDecision[] = ["approve", "reject"],
): InterruptOn {
    return {
        [toolName]: {
            allowedDecisions,
            description: (toolCall) =>
                `${prefix}\n\nArgs: ${JSON.stringify(toolCall.args, null, 2)}`,
        },
    }
}

/**
 * Mehrere Partial-Configs zu einer `interruptOn`-Map zusammenführen.
 *
 * @example
 * interruptOn: mergeInterruptOn(
 *     requireApproval("execute"),
 *     approveOrReject("getCandidates", "Bewerberdaten abrufen?"),
 *     withToolArgsDescription("sendEmail", "E-Mail senden:"),
 * )
 */
export function mergeInterruptOn(...configs: InterruptOn[]): InterruptOn {
    return Object.assign({}, ...configs)
}

/**
 * Preset: `write_file` und `edit_file` brauchen User-Freigabe.
 *
 * @example
 * const deepAgent = new DeepAgent({
 *     checkpointer: new MemorySaver(),
 *     interruptOn: filesystemWritesRequireApproval(),
 * })
 */
export function filesystemWritesRequireApproval(
    description = "Datei-Schreiboperation — bitte bestätigen.",
): InterruptOn {
    return mergeInterruptOn(
        requireApprovalWithDescription("write_file", description),
        requireApprovalWithDescription("edit_file", description),
    )
}
