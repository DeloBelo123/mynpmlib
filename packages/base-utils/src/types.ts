export type Prettify<T> = {
  [K in keyof T]: T[K]
} & {};

export type AutoComplete<
T extends string
> = T | (string & {});