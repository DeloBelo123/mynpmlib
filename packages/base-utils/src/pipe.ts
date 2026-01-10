export default class pipe {
  private static instance: pipe | null = null;
  private value: any = null;

  private constructor() {}

  static start(fn: () => any): pipe {
    if (!pipe.instance) {
      pipe.instance = new pipe();
    }
    pipe.instance.value = null;
    pipe.instance.value = fn();
    return pipe.instance;
  }

  then(fn: (value: any) => any): pipe {
    this.value = fn(this.value);
    return this;
  }

  return(fn: (value: any) => any) {
    const result = fn(this.value);
    this.value = null;
    return result;
  }
}


