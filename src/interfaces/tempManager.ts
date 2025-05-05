// Interface for temporary directory creation/cleanup
export default interface TempManager {
    mkdtemp(prefix: string): Promise<string>;
    cleanup(dirPath: string | undefined): Promise<void>;
}
