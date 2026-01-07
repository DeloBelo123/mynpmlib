export declare function create_file(file: string, content: string): Promise<boolean>;
export declare function create_sub_file(pathStr: string, content: string): Promise<boolean>;
export declare function read_file(file: string): Promise<string>;
export declare function read_all_files_in_dir(dir: string): Promise<string[]>;
export declare function read_file_lines(file: string): Promise<string[]>;
export declare function add_to_file(file: string, content: string): Promise<boolean>;
export declare function does_file_exist(file: string): Promise<boolean>;
export declare function write_n_run(file: string, content: string, interpreter: string, is_subfile?: boolean, aus_führen?: boolean): Promise<string>;
export declare function write_n_run_py(file: string, content: string, is_subfile?: boolean, aus_führen?: boolean): Promise<string>;
export declare function write_n_run_js(file: string, content: string, is_subfile?: boolean, aus_führen?: boolean): Promise<string>;
export declare function remove_file(file: string): Promise<boolean>;
export declare function remove_empty_dir(dir: string): Promise<boolean>;
//# sourceMappingURL=file-utils.d.ts.map