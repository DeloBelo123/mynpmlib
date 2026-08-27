import * as readline from 'readline';
import { exec, spawn } from 'child_process';
import { safe } from '../safe.js';

export function input(prompt: string = ''): Promise<string> {
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
    //kurlaufender scheiss
    exec: async function(command:string):Promise<string>{
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
    
    //langer scheiss (muss ja prozess gestartet werden wegen dem amk)
    run: async function(command:string):Promise<number>{
        return new Promise((resolve, reject) => {
            const proc = spawn(command, {
              shell: true,
              stdio: "inherit", // live output
            });
        
            proc.on("close", code => resolve(code ?? 0));
            proc.on("error", err => reject(err));
          });
    },

    exists: async function(command:string):Promise<boolean>{
        const [_, error] = await safe(this.exec(`command -v ${command}`))
        if(error) return false
        else return true
    }
}



