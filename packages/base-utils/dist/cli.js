import * as readline from 'readline';
import { exec, spawn } from 'child_process';
export function input(prompt = '') {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}
export const terminal = {
    exec: async function (command) {
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    reject(stderr || error);
                    return;
                }
                resolve(stdout);
            });
        });
    },
    run: async function (command) {
        return new Promise((resolve, reject) => {
            const proc = spawn(command, {
                shell: true,
                stdio: "inherit", // live output
            });
            proc.on("close", code => resolve(code ?? 0));
            proc.on("error", err => reject(err));
        });
    },
    exists: async function (command) {
        try {
            await this.exec(`command -v ${command}`);
            return true;
        }
        catch {
            return false;
        }
    }
};
//# sourceMappingURL=cli.js.map