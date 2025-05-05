import * as fs from 'node:fs/promises';
import FileSystem from '../interfaces/fileSystem';

// Implement the FileSystem interface using the real fs/promises module
const realFileSystem: FileSystem = {
    access: fs.access,
    chmod: fs.chmod,
    writeFile: fs.writeFile,
    readFile: fs.readFile,
    unlink: fs.unlink,
    rm: fs.rm,
    mkdir: fs.mkdir,
    copyFile: fs.copyFile,
    stat: fs.stat,
};
export default realFileSystem;
