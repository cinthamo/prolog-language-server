const fs = require('fs-extra');
const path = require('path');
const os = require('os');

require('dotenv').config(); 

// --- Configuration ---
const blintSourceDir = process.env.BLINT_SOURCE_DIR; // Get from environment variable
const targetBinDir = path.resolve(__dirname, '../bin'); // Target ./bin directory

if (!blintSourceDir) {
  console.error('Error: BLINT_SOURCE_DIR environment variable is not set.');
  process.exit(1);
}

// Mapping from source folder names to target platform-arch names used by Node/VSCode
const platformMappings = [
  { source: 'linux-arm64', target: 'linux-arm64', file: 'BLint' },
  { source: 'linux-x64', target: 'linux-x64', file: 'BLint' },
  { source: 'osx-arm64', target: 'darwin-arm64', file: 'BLint' },
  { source: 'win-x64', target: 'win32-x64', file: 'BLint.exe' },
];

async function copyBinaries() {
  let copiedCount = 0;
  let skippedCount = 0;

  try {
    console.log(`Source BLint directory: ${blintSourceDir}`);
    console.log(`Target bin directory:   ${targetBinDir}`);

    // 1. Ensure the base target directory exists (no cleaning needed)
    await fs.ensureDir(targetBinDir);

    // 2. Process each platform's binary
    for (const mapping of platformMappings) {
      const sourcePath = path.join(blintSourceDir, mapping.source, mapping.file);
      const targetPlatformDir = path.join(targetBinDir, mapping.target);
      const targetPath = path.join(targetPlatformDir, mapping.file);

      process.stdout.write(`Checking ${mapping.target}/${mapping.file}... `); // Use process.stdout for inline status

      // Check if source exists first
      if (!(await fs.pathExists(sourcePath))) {
         console.warn(`SKIP (Source not found: ${sourcePath})`);
         skippedCount++;
         continue;
      }

      let copyNeeded = false;
      let targetExists = await fs.pathExists(targetPath);

      if (!targetExists) {
        copyNeeded = true;
        process.stdout.write(`COPY (Target does not exist)`);
      } else {
        // Target exists, compare stats
        try {
          const [sourceStats, targetStats] = await Promise.all([
            fs.stat(sourcePath),
            fs.stat(targetPath)
          ]);

          if (sourceStats.size !== targetStats.size) {
            copyNeeded = true;
            process.stdout.write(`COPY (Different size)`);
          } else if (sourceStats.mtimeMs > targetStats.mtimeMs) {
            copyNeeded = true;
            process.stdout.write(`COPY (Source is newer)`);
          } else {
            // Target exists and is up-to-date
            process.stdout.write(`SKIP (Up-to-date)`);
            skippedCount++;
          }
        } catch (statError) {
          console.warn(`\nWarning: Could not get stats for source/target (${targetPath}). Forcing copy. Error: ${statError}`);
          copyNeeded = true; // Force copy if stats fail
          process.stdout.write(`COPY (Stat error)`);
        }
      }

      // Perform copy and set permissions if needed
      if (copyNeeded) {
        try {
          await fs.ensureDir(targetPlatformDir); // Ensure subdir exists
          await fs.copy(sourcePath, targetPath, { overwrite: true }); // Overwrite if needed
          copiedCount++;
          process.stdout.write(` -> Copied`);

          // Set execute permissions if needed (non-Windows)
          if (os.platform() !== 'win32' && mapping.target !== 'win32-x64') {
            try {
                await fs.chmod(targetPath, 0o755); // rwxr-xr-x
                process.stdout.write(` +x`);
            } catch (chmodError) {
                 process.stdout.write(` (chmod failed!)`);
                 console.warn(`\nWarning: Failed to set execute permission on ${targetPath}. This might cause issues on Linux/macOS.`, chmodError);
            }
          }
           console.log(); // Newline after successful copy status
        } catch (copyError) {
            console.log(` -> FAILED!`); // Finish the status line
            console.error(`\nError copying ${sourcePath} to ${targetPath}:`, copyError);
           // Decide if you want to exit immediately or continue with others
           // process.exit(1);
        }
      } else {
          console.log(); // Newline after skip status
      }
    } // End for loop

    console.log(`\nFinished copying BLint binaries. Copied: ${copiedCount}, Skipped: ${skippedCount}.`);

  } catch (error) {
    console.error('\nError during BLint binary copy process:', error);
    process.exit(1); // Indicate failure
  }
}

copyBinaries();
