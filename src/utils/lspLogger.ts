import { Connection } from 'vscode-languageserver';
import Logger from '../interfaces/logger';

export default class LspLogger implements Logger {
    // Define the standard prefix for all logs from this logger
    private static LOG_PREFIX = '[PrologLS]';

    constructor(private connection: Connection) {}

    error(message: string, ...meta: any[]): void {
        this.connection.console.error(this.format(message, meta));
    }
    warn(message: string, ...meta: any[]): void {
        this.connection.console.warn(this.format(message, meta));
    }
    info(message: string, ...meta: any[]): void {
        this.connection.console.info(this.format(message, meta));
    }
    debug(message: string, ...meta: any[]): void {
        this.connection.console.log(this.format(message, meta));
    }

    // Updated format method to include the standard prefix
    private format(message: string, meta: any[]): string {
         let metaString = '';
         if (meta && meta.length > 0) {
             try {
                 // Stringify carefully, handle potential circular references?
                 // For simplicity now:
                 metaString = ' ' + meta.map(m => {
                     if (m instanceof Error) { return `{Error: ${m.message}}`; } // Basic error handling
                     try { return JSON.stringify(m); } catch { return '[Unserializable]'; }
                 }).join(' ');
             } catch (e) {
                 metaString = ' [meta serialization error]';
             }
         }
         // Add the prefix here
         return `${LspLogger.LOG_PREFIX} ${message}${metaString}`;
    }
}
