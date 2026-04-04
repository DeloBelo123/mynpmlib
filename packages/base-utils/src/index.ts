export * from "./util-funcs"
export * from "./rule"
export type Prettify<T> = {
    [K in keyof T]: T[K]
} & {}
