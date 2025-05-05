// Simple Debounce Utility (can be replaced with lodash.debounce)
export default class Debouncer {
    private timeouts = new Map<string, NodeJS.Timeout>();
    constructor(private delayMs: number) {}

    debounce(key: string, func: () => void): void {
        if (this.timeouts.has(key)) {
            clearTimeout(this.timeouts.get(key)!);
        }
        this.timeouts.set(key, setTimeout(() => {
            this.timeouts.delete(key);
            func();
        }, this.delayMs));
    }

    clear(key: string): void {
         if (this.timeouts.has(key)) {
            clearTimeout(this.timeouts.get(key)!);
            this.timeouts.delete(key);
        }
    }
}
