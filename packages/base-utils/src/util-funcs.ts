export function *enumerate<T>(arr: Iterable<T>,starting_index:number = 0) {
    let i = starting_index
    for (const item of arr) {
      yield [i++, item] as const
    }
}

export function* zip<T extends readonly Iterable<any>[]>(
    ...iterables: T
  ): Generator<
    { [K in keyof T]: T[K] extends Iterable<infer U> ? U : never }
  > {
    const iterators = iterables.map(it => it[Symbol.iterator]())
  
    while (true) {
      const results = iterators.map(it => it.next())
  
      if (results.some(r => r.done)) return
  
      yield results.map(r => r.value) as any
    }
}

export function *range(
    start: number,
    end?: number,
    step = 1
  ) {
    if (end === undefined) {
      end = start
      start = 0
    }
    for (let i = start; i < end; i += step) {
      yield i
    }
}

export function pick<
  T extends Record<PropertyKey, any>,
  const K extends readonly (keyof T)[]
>(
  obj: T,
  keys: K
): Pick<T, K[number]> {
  const out = {} as Pick<T, K[number]>
  for (const k of keys) {
    if (k in obj) out[k] = obj[k]
  }
  return out
}


export function omit<
  T extends Record<PropertyKey, any>,
  const K extends readonly (keyof T)[]
>(
  obj: T,
  keys: K
): Omit<T, K[number]> {
  const out = { ...obj } 
  for (const k of keys) {
    delete out[k]
  }
  return out
}


export function array<T>(iter:Iterable<T>):Array<T>{
    const arr = []
    for(const item of iter){
        arr.push(item)
    }
    return arr
}

export function object<T extends readonly [PropertyKey,any][]>(arr:T){
    const obj:Record<PropertyKey,any> = {} 
    for(const [k,v] of arr){
        obj[k] = v
    }
    return obj
}