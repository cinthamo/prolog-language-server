import * as os from 'os';
import * as path from 'path';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { PrologServerSettings } from '../types';
import BlintLocator from '../interfaces/blintLocator';
import Logger from '../interfaces/logger';

const MARKER_FILENAME = '.server_root'; // Or your chosen name

function findServerRoot(logger: Logger): string | null {
    let currentDir = __dirname;
    // Limit search depth to prevent infinite loops in weird setups
    for (let i = 0; i < 10; i++) {
        const markerPath = path.join(currentDir, MARKER_FILENAME);
        try {
            // Use synchronous stat here as it's part of initialization
            if (fs.statSync(markerPath).isFile()) {
                return currentDir; // Found the root directory
            }
        } catch (e) {
            // Ignore errors (ENOENT specifically)
        }

        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
            // Reached filesystem root without finding marker
            break;
        }
        currentDir = parentDir;
    }
    logger.error("blintLocator: Could not find server root marker file.");
    return null; // Marker not found
}

/**
 * Determines the expected path to the bundled BLint binary based on OS/Arch.
 * Note: This relies on __dirname pointing correctly relative to the output structure.
 */
function getBundledPathString(logger: Logger): string | null {
    const serverRoot = findServerRoot(logger);
    if (!serverRoot) {
        return null; // Root couldn't be determined
    }

    const platform = os.platform(); // 'win32', 'darwin', 'linux'
    const arch = os.arch();       // 'x64', 'arm64'

    let osFolderName: string;
    let archFolderName = arch;
    let executableName = 'BLint';

    switch (platform) {
        case 'win32':
            osFolderName = 'win32'; executableName += '.exe'; break;
        case 'darwin':
            osFolderName = 'darwin'; break;
        case 'linux':
            osFolderName = 'linux'; break;
        default:
            logger.error(`blintLocator: Unsupported platform: ${platform}`);
            return null;
    }

    const binaryPath = path.join(
        serverRoot, // Use the found root
        'bin',
        `${osFolderName}-${archFolderName}`,
        executableName
    );
    return binaryPath;
}


const realBlintLocator = (logger: Logger): BlintLocator => ({
    getBlintPath: async (settings: PrologServerSettings): Promise<string | null> => {
        let blintPathToUse: string | null = null;
        let pathSource: 'config' | 'bundled' | 'none' = 'none';
        const configuredPath = settings.blint?.path;

        // 1. Decide path
        if (configuredPath && typeof configuredPath === 'string' && configuredPath.trim() !== '') {
            blintPathToUse = configuredPath; pathSource = 'config';
        } else {
            blintPathToUse = getBundledPathString(logger); pathSource = blintPathToUse ? 'bundled' : 'none';
        }

        // 2. Validate path
        if (!blintPathToUse) { return null; } // Already logged inside getBundledPathString if null

        try {
            await fsPromises.access(blintPathToUse, fsPromises.constants.X_OK);
            return blintPathToUse; // Path is valid and executable
        } catch (err) {
            const sourceMsg = pathSource === 'config' ? 'Configured' : 'Bundled';
            let message = `${sourceMsg} BLint path "${blintPathToUse}" is not found or not executable.`;

            if (pathSource === 'bundled') { // Try chmod only for bundled
                try {
                    await fsPromises.chmod(blintPathToUse, 0o755);
                    await fsPromises.access(blintPathToUse, fsPromises.constants.X_OK);
                    logger.info(`Set execute permission on bundled ${blintPathToUse}`);
                    return blintPathToUse; // Now it's valid
                } catch (chmodErr) {
                    message = `Bundled BLint found at "${blintPathToUse}" but it's not executable (chmod failed).`;
                    logger.error(`realBlintLocator: ${message}`, chmodErr);
                    return null; // Return null if invalid after chmod attempt
                }
            } else {
                // Configured path failed access check, don't try chmod
                logger.error(`realBlintLocator: ${message}`, err);
                return null; // Return null if invalid
            }
        }
    }
});

export default realBlintLocator;
export { getBundledPathString };
