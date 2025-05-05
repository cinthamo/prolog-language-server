import * as cp from 'child_process';
import path from 'path';
import CommandRunner from '../interfaces/commandManager';
import Logger from '../interfaces/logger';
import PrefixLogger from './prefixLogger';

export interface CommandResult {
    stdout: string;
    stderr: string;
    code: number | null; // Exit code (null if killed by signal)
}

export default class RealCommandRunner implements CommandRunner {
    constructor(private commandPath: string, private logger: Logger) {}

    async execute(...args: string[]): Promise<CommandResult> {
        return new Promise((resolve, reject) => {
            const logger = new PrefixLogger(`CommandRunner ${path.basename(this.commandPath)}`, this.logger);            
            const commandString = `${this.commandPath} ${args.join(' ')}`; // For logging
            logger.info(`Executing: ${commandString}`);
            const process = cp.spawn(this.commandPath, args);
            let stdout = '';
            let stderr = '';
            let error: Error | null = null; // Capture spawn errors

            process.stdout.on('data', (data) => { stdout += data.toString(); });
            process.stderr.on('data', (data) => { stderr += data.toString(); });

            // Capture errors related to spawning the process itself
            process.on('error', (err) => {
                logger.error(`Failed to start command: ${commandString}`, err);
                error = new Error(`Failed to start BLint process (${this.commandPath}): ${err.message}`);
                // Don't reject yet, wait for 'close' to ensure cleanup and capture stderr/stdout
            });

            process.on('close', (code) => {
                // If a spawn error occurred, reject with that error
                if (error) {
                    return reject(error);
                }
                // Otherwise, always resolve with the result, including the exit code
                logger.info(`Command finished with code ${code}. Stderr length: ${stderr.length}, Stdout length: ${stdout.length}`);
                resolve({ stdout, stderr, code });
            });
        });
    }
}
