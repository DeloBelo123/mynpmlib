export function *enumerate<T>(arr: Iterable<T>,starting_index:number = 0) {
    let i = starting_index
    for (const item of arr) {
      yield [i++, item] as const
    }
}

export function* zip<const T extends readonly Iterable<any>[]>(
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

export async function sleep(ms:number){
    return new Promise((res) => setTimeout(res,1000) )
}

export function isEmpty<T>(x:Array<T> | Record<string,T>): boolean{
  if(Array.isArray(x)) if(x.length === 0) return true
  if(Object.keys(x).length === 0) return true
  return false
}

export function cache<T>(name:string,value:T){
  const map = new Map([[name,value]])
  return {
    set(name:string,value:T){
      map.set(name,value)
    },
    get(name:string){
      return map.get(name)
    }
  }
}







