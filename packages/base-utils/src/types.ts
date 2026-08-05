export type Prettify<T> = { [K in keyof T]: T[K] } & {};

export type AutoComplete<T extends string> = T | (string & {})

export function keys<const T extends string>(obj:Record<T,any>): T[]{
    return Object.keys(obj) as T[]
}

export function entries<const T extends Record<string, unknown>>(
    obj: T
): { [K in keyof T]: [K, T[K]] }[keyof T][] {
    return Object.entries(obj) as any
}


