import * as path from 'node:path';
import { PrologServerSettings } from '../types';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver/node';
import { DiagnosticData } from '../parseResult/types';
import FileSystem from '../interfaces/fileSystem';
import CommandRunner from '../interfaces/commandManager';
import TempManager from '../interfaces/tempManager';
import BlintLocator from '../interfaces/blintLocator';
import Logger from '../interfaces/logger';
import PrologAst from '../ast/types';
import PrefixLogger from '../utils/prefixLogger';

// Structure to hold the injected dependencies
export interface ParserDependencies {
    fs: FileSystem;
    commandRunnerFactory: (executablePath: string, logger: Logger) => CommandRunner;
    tempManager: TempManager;
    blintLocator: BlintLocator;
    logger: Logger;
}

/**
* Generates ParseResult using injected dependencies.
* @param sourceFilePath Absolute path to the source file.
* @param documentContent Content of the document to parse. (it may differ from sourceFilePath if it's a virtual document)
* @param settings The current effective settings for this document scope.
* @param deps Injected dependencies (fs, command runner factory, temp manager, blint locator).
* @returns The ParseResult.
*/
export async function parseProlog(
    sourceFilePath: string,
    documentContent: string,
    settings: PrologServerSettings,
    deps: ParserDependencies
): Promise<{ success: true, ast: PrologAst, warning?: string } | { success: false, error :string }> {
    const logger = new PrefixLogger(`PrologParser ${path.basename(sourceFilePath)}`, deps.logger);
    let tmpDir: string | undefined = undefined;
    
    try {
        // --- 1. Get and Validate BLint Path using Locator ---
        const blintPathToUse = await deps.blintLocator.getBlintPath(settings);
        
        if (!blintPathToUse) {
            // Locator should have already logged/created diagnostic if path invalid/missing
            const message = `BLint path could not be determined or validated. Check logs or configuration 'prologLanguageServer.blint.path'.`;
            logger.error(message);
            return { success: false, error: message };
        }
        // Path validation (access/chmod) is now assumed to be handled *within* deps.blintLocator.getBlintPath
        
        // --- 2. Prepare Temp Files using TempManager and injected FS ---
        logger.info(`Parsing ${path.basename(sourceFilePath)} using BLint at ${blintPathToUse}...`);
        tmpDir = await deps.tempManager.mkdtemp(`prolog-lsp-parser-`);
        const tempSourcePath = path.join(tmpDir, path.basename(sourceFilePath));
        await deps.fs.writeFile(tempSourcePath, documentContent, 'utf-8');
        const outputFileName = `${path.basename(sourceFilePath, path.extname(sourceFilePath))}.AST.json`;
        const expectedOutputFile = path.join(tmpDir, outputFileName);
        await deps.fs.unlink(expectedOutputFile).catch(err => { if (err.code !== 'ENOENT') logger.warn(`Could not delete previous temp file: ${expectedOutputFile}`); });
        
        // --- 3. Execute BLint using CommandRunner Factory ---
        const parser = deps.commandRunnerFactory(blintPathToUse, deps.logger); // Create runner instance
        const executionResult = await parser.execute(...['-ec', '-ast', `-o${tmpDir}`, ...(settings.blint.args || []), tempSourcePath]); // -ec preserve comments, -ast generate AST, -o output directory
        
        // --- 4. Process Execution Result (Same logic as before) ---
        let warning: string | undefined = undefined;
        if (executionResult.code !== 0 && (executionResult.code !== 1 || (await deps.fs.stat(expectedOutputFile))?.size === 0)) {
            const message = `BLint process exited with error code ${executionResult.code}.`;
            logger.warn(message, { stderr: executionResult.stderr?.substring(0, 500) });            
            warning = `${message} Check log output for details.`;
        }
        
        // --- 5. Read, Parse AST JSON, and Transform ---
        logger.debug(`Attempting to read AST JSON output: ${expectedOutputFile}`);
        try {
            const outputContent = await deps.fs.readFile(expectedOutputFile, { encoding: 'utf-8' });
            logger.debug(`Read ${outputContent.length} bytes from AST JSON file.`);
            try {
                // Parse into the detailed AST structure first
                const parsedAst = JSON.parse(outputContent) as PrologAst;
                logger.debug(`Successfully parsed AST JSON.`);
                return { success: true, ast: parsedAst, warning };
            } catch (jsonOrTransformError: any) {
                const message = `Error processing BLint AST JSON output in ${outputFileName}.`;
                logger.error(message, { error: jsonOrTransformError.message, contentStart: outputContent.substring(0, 500) + '...', file: sourceFilePath });
                return { success: false, error: `${message} Error: ${jsonOrTransformError.message}` };
            }
        } catch (readError: any) {
            // --- Handle File Read Errors ---
            if (readError.code === 'ENOENT') {
                // JSON file doesn't exist - Log appropriately based on exit code
                if (executionResult.code === 0) {
                    const message = `BLint ran successfully but produced no output JSON file (${outputFileName}).`;
                    logger.warn(message);
                    return { success: false, error: message };
                } else if (executionResult.code !== 0) {
                    logger.warn(`BLint failed (code ${executionResult.code}) and produced no output JSON file.`);
                    return { success: false, error: `BLint failed (code ${executionResult.code}) and produced no output JSON file.` };
                } else { // code === 0 but directDiagnostics > 0
                    logger.info(`BLint finished, no JSON output, but found diagnostics in stdout/stderr.`);
                    return { success: false, error: `BLint finished, no JSON output, but found diagnostics in stdout/stderr.` };
                }
            } else {
                // Other file read error (e.g., permissions)
                const message = `Error reading BLint output file ${outputFileName}.`;
                logger.error(`${message} Error: ${readError.message}`, { file: sourceFilePath }, readError);
                return { success: false, error: `${message} Error: ${readError.message}` };
            }
        }
        
    } catch (error: any) {
        // Catch errors during setup phase (e.g., temp dir creation, locator errors if it throws)
        const message = `Critical error during BLint analysis setup for ${sourceFilePath}: ${error.message}`;
        logger.error(message, error);
        return { success: false, error: message };
    } finally {
        // --- 6. Cleanup using TempManager ---
        await deps.tempManager.cleanup(tmpDir);
    }
}

export function convertToLspDiagnostics(diagData: DiagnosticData[] | undefined): Diagnostic[] {
    if (!diagData) return [];
    return diagData.map(d => {
        let severity: DiagnosticSeverity = DiagnosticSeverity.Information;
        switch (d.severity) { /* ... as before ... */ }
        // BLint line is 1-based, LSP is 0-based
        // Assume character 0 for now unless BLint provides it
        const line = Math.max(0, d.line - 1); // Ensure line is not negative
        const range = Range.create(line, d.character ?? 0, line, d.character ?? 0); // Use char if provided, else 0
        return Diagnostic.create(range, d.message, severity, undefined, 'BLint'); // Source 'BLint'
    });
}
