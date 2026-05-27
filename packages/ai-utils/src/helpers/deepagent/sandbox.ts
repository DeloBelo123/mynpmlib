import { DenoSandbox, DaytonaSandbox } from "../../imports"

type DenoSandboxOptions = NonNullable<Parameters<typeof DenoSandbox.create>[0]>
type DaytonaSandboxOptions = NonNullable<Parameters<typeof DaytonaSandbox.create>[0]>

export async function createDenoSandbox(options?: DenoSandboxOptions) {
    return DenoSandbox.create(options)
}

export async function createDaytonaSandbox(options?: DaytonaSandboxOptions) {
    return DaytonaSandbox.create(options)
}
