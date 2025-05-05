import Logger from "../interfaces/logger";

export default class ConsoleLogger implements Logger {
    info(message: string, ...meta: any[]): void {
        console.log(message, ...meta);
    }
    warn(message: string, ...meta: any[]): void {
        console.warn(message, ...meta);
    }
    error(message: string, ...meta: any[]): void {
        console.error(message, ...meta);
    }
    debug(message: string, ...meta: any[]): void {
        console.debug(message, ...meta);
    }
}
