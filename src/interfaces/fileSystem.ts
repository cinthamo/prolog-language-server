import * as fs from 'node:fs';

// Define types based on the actual fs/promises functions
type PathLike = fs.PathLike; // Use the PathLike type
type FileHandle = fs.promises.FileHandle; // Use the FileHandle type
type Stats = fs.Stats;
// Define common options types or import them if needed elsewhere
type WriteFileOptions = fs.WriteFileOptions;
type ReadFileOptions = { encoding: BufferEncoding; flag?: fs.OpenMode; signal?: AbortSignal; }
type RmOptions = fs.RmOptions;
type MakeDirectoryOptions = fs.MakeDirectoryOptions;

// Interface for file system operations needed by the parser
export default interface FileSystem {
    // Use types compatible with fs.promises.access
    access(path: PathLike, mode?: number | undefined): Promise<void>;

    // Use types compatible with fs.promises.chmod
    chmod(path: PathLike, mode: string | number): Promise<void>;

    // Use types compatible with fs.promises.writeFile
    writeFile(
        file: PathLike | FileHandle,
        data: string | NodeJS.ArrayBufferView | Iterable<string | NodeJS.ArrayBufferView> | AsyncIterable<string | NodeJS.ArrayBufferView> | NodeJS.ReadableStream,
        options?: WriteFileOptions | BufferEncoding | null
    ): Promise<void>;

    // Use types compatible with fs.promises.readFile, specifically aiming for string result
    readFile(
        path: PathLike | FileHandle,
        options?: ReadFileOptions | BufferEncoding | null
    ): Promise<string>;

    // Use types compatible with fs.promises.unlink
    unlink(path: PathLike): Promise<void>;

    // Use types compatible with fs.promises.rm
    rm(path: PathLike, options?: RmOptions): Promise<void>;

    // Use types compatible with fs.promises.mkdir
    mkdir(path: PathLike, options?: MakeDirectoryOptions | null): Promise<string | undefined>;

    // Use types compatible with fs.promises.copyFile
    copyFile(source: PathLike, destination: PathLike, mode?: number): Promise<void>;

    // Use types compatible with fs.promises.stat
    stat(path: PathLike): Promise<Stats| undefined>;
}
