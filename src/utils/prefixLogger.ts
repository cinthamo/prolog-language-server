import Logger from "../interfaces/logger";

export default class PrefixLogger implements Logger {
    constructor(private prefix: string, private logger: Logger) {}

    error(message: string, ...meta: any[]): void {
        this.logger.error(`${this.prefix}: ${message}`, ...meta);
    }
    warn(message: string, ...meta: any[]): void {
        this.logger.warn(`${this.prefix}: ${message}`, ...meta);
    }
    info(message: string, ...meta: any[]): void {
        this.logger.info(`${this.prefix}: ${message}`, ...meta);
    }
    debug(message: string, ...meta: any[]): void {
        this.logger.debug(`${this.prefix}: ${message}`, ...meta);
    }
}
