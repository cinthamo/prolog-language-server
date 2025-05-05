// Interface for running the external command
export default interface CommandRunner {
    execute(...args: string[]): Promise<CommandResult>;
}

export interface CommandResult {
    stdout: string;
    stderr: string;
    code: number | null;
}
