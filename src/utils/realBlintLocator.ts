import * as os from 'os';
import * as path from 'path';
import * as fsPromises from 'node:fs/promises';
import { PrologServerSettings } from '../types';
import BlintLocator from '../interfaces/blintLocator';

/**
 * Determines the expected path to the bundled BLint binary based on OS/Arch.
 * Note: This relies on __dirname pointing correctly relative to the output structure.
 */
function getBundledPathString(): string | null {
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
            console.error(`blintLocator: Unsupported platform: ${platform}`);
            return null;
    }

    try {
        // Calculate path relative to the *compiled JS file* in the 'out' directory
        // Assuming structure: out/src/utils/blintLocator.js
        // Go up 2 levels to get to 'out/', then into 'bin/'
        const serverOutDir = path.resolve(__dirname, '../..');
        const binaryPath = path.join(
            serverOutDir, // Should be <project_root>/out
            'bin',
            `${osFolderName}-${archFolderName}`,
            executableName
        );
        return binaryPath;
    } catch (e) {
        // This might happen if __dirname is unexpected (e.g., during tests sometimes)
        console.error("blintLocator: Error resolving path relative to __dirname", e);
         // Fallback: Try relative to CWD (less reliable)
         try {
            const fallbackPath = path.resolve(
                'bin', // Assumes test runs from project root
                `${osFolderName}-${archFolderName}`,
                executableName
            );
            console.warn(`blintLocator: Falling back to CWD-relative path: ${fallbackPath}`);
            return fallbackPath;
         } catch (e2) {
             console.error("blintLocator: Error resolving path relative to CWD", e2);
             return null;
         }
    }
}


const realBlintLocator: BlintLocator = {
    getBlintPath: async (settings: PrologServerSettings): Promise<string | null> => {
        let blintPathToUse: string | null = null;
        let pathSource: 'config' | 'bundled' | 'none' = 'none';
        const configuredPath = settings.blint?.path;

        // 1. Decide path
        if (configuredPath && typeof configuredPath === 'string' && configuredPath.trim() !== '') {
            blintPathToUse = configuredPath; pathSource = 'config';
        } else {
            blintPathToUse = getBundledPathString(); pathSource = blintPathToUse ? 'bundled' : 'none';
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
                    console.log(`Set execute permission on bundled ${blintPathToUse}`);
                    return blintPathToUse; // Now it's valid
                } catch (chmodErr) {
                    message = `Bundled BLint found at "${blintPathToUse}" but it's not executable (chmod failed).`;
                    console.error(`realBlintLocator: ${message}`, chmodErr);
                    return null; // Return null if invalid after chmod attempt
                }
            } else {
                // Configured path failed access check, don't try chmod
                console.error(`realBlintLocator: ${message}`, err);
                return null; // Return null if invalid
            }
        }
    }
};

export default realBlintLocator;
export { getBundledPathString };
