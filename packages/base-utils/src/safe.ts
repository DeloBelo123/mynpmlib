type Result<T,E> = [T, null] | [null, E]

export async function safe<T, E = Error>(promise:Promise<T>): Promise<Result<T, E>> {
    try {
        const data = await promise
        return [data, null]
    } catch (error) {
        const e = error instanceof Error ? error : new Error(String(error))
        return [null, e as E]
    }
}
