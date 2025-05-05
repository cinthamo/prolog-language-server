import * as tmp from 'tmp';
import * as fs from 'node:fs/promises';
import TempManager from '../interfaces/tempManager';

tmp.setGracefulCleanup();

const realTempManager: TempManager = {
    mkdtemp: (prefix: string): Promise<string> => {
        return new Promise((resolve, reject) => {
            tmp.dir({ prefix, unsafeCleanup: true }, (err, name) => {
                if (err) reject(err); else resolve(name);
            });
        });
    },
    cleanup: async (dirPath: string | undefined): Promise<void> => {
        if (dirPath) {
            await fs.rm(dirPath, { recursive: true, force: true }).catch(e => console.error(`Error removing temp dir ${dirPath}:`, e));
        }
    }
};
export default realTempManager;
