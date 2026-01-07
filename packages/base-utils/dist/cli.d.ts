export declare function input(prompt?: string): Promise<string>;
export declare const terminal: {
    exec: (command: string) => Promise<string>;
    run: (command: string) => Promise<number>;
    exists: (command: string) => Promise<boolean>;
};
//# sourceMappingURL=cli.d.ts.map