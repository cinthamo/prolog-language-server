import * as path from 'node:path';
import { PrologServerSettings } from '../types';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver/node';
import { transformAstToParseResult } from '../ast/processor';
import ParseResult, { DiagnosticData } from '../parseResult/types';
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
): Promise<ParseResult> {
    const logger = new PrefixLogger(`PrologParser ${path.basename(sourceFilePath)}`, deps.logger);
    const baseResult: ParseResult = { filePath: sourceFilePath, predicates: [], diagnostics: [] };
    let tmpDir: string | undefined = undefined;
    
    try {
        // --- 1. Get and Validate BLint Path using Locator ---
        const blintPathToUse = await deps.blintLocator.getBlintPath(settings);

        if (!blintPathToUse) {
            // Locator should have already logged/created diagnostic if path invalid/missing
            const message = `BLint path could not be determined or validated. Check logs or configuration 'prologLanguageServer.blint.path'.`;
            logger.error(message);
            baseResult.diagnostics?.push({ line: 1, character: 0, message, severity: 'error' });
            return baseResult;
        }
         // Path validation (access/chmod) is now assumed to be handled *within* deps.blintLocator.getBlintPath

        // --- 2. Prepare Temp Files using TempManager and injected FS ---
        logger.info(`Parsing ${path.basename(sourceFilePath)} using BLint at ${blintPathToUse}...`);
        tmpDir = await deps.tempManager.mkdtemp(`prolog-lsp-parser-`);
        const tempSourcePath = path.join(tmpDir, path.basename(sourceFilePath));
        await deps.fs.writeFile(tempSourcePath, documentContent, 'utf-8');
        const outputFileName = `${path.basename(sourceFilePath, path.extname(sourceFilePath))}.AST.json`;
        const expectedOutputFile = path.join(tmpDir, outputFileName);
        await deps.fs.unlink(expectedOutputFile).catch(err => { if (err.code !== 'ENOENT') console.warn(`Could not delete previous temp file: ${expectedOutputFile}`); });

        // --- 3. Execute BLint using CommandRunner Factory ---
        const parser = deps.commandRunnerFactory(blintPathToUse, deps.logger); // Create runner instance
        const executionResult = await parser.execute(...['-ec', '-ast', `-o${tmpDir}`, ...(settings.blint.args || []), tempSourcePath]); // -ec preserve comments, -ast generate AST, -o output directory

        // --- 4. Process Execution Result (Same logic as before) ---
        if (executionResult.code !== 0 && (executionResult.code !== 1 || (await deps.fs.stat(expectedOutputFile))?.size === 0)) {
            const message = `BLint process exited with error code ${executionResult.code}.`;
            logger.warn(message, { stderr: executionResult.stderr?.substring(0, 500) });

            baseResult.diagnostics?.push({
                line: 1, // Default to line 1 for general process errors
                character: 0,
                message: `${message} Check log output for details.`,
                severity: 'warning' // Use 'warning' as it might have still produced some output
            });
        }

        // --- 5. Read, Parse AST JSON, and Transform ---
        logger.debug(`Attempting to read AST JSON output: ${expectedOutputFile}`);
        try {
            const outputContent = await deps.fs.readFile(expectedOutputFile, { encoding: 'utf-8' });
            logger.debug(`Read ${outputContent.length} bytes from AST JSON file.`);
            try {
                // Parse into the detailed AST structure first
                const parsedAst = JSON.parse(outputContent) as PrologAst;
                // TODO: Add basic validation if parsedAst or parsedAst.predicates is missing?

                logger.debug(`Successfully parsed AST JSON.`);

                // --- Transform into ParseResult ---
                const transformedResult = transformAstToParseResult(parsedAst);

                // Merge predicates and diagnostics from transformation
                baseResult.predicates = transformedResult.predicates;
                baseResult.diagnostics?.push(...(transformedResult.diagnostics || [])); // Keep diagnostics added earlier from BLint execution errors/stderr
            } catch (jsonOrTransformError: any) {
                const message = `Error processing BLint AST JSON output in ${outputFileName}.`;
                logger.error(message, { error: jsonOrTransformError.message, contentStart: outputContent.substring(0, 500) + '...', file: sourceFilePath });
                baseResult.diagnostics?.push({ line: 1, character: 0, message: `${message} Error: ${jsonOrTransformError.message}`, severity: 'error' });
            }
        } catch (readError: any) {
            // --- Handle File Read Errors ---
            if (readError.code === 'ENOENT') {
                // JSON file doesn't exist - Log appropriately based on exit code
                if (executionResult.code === 0) {
                    const message = `BLint ran successfully but produced no output JSON file (${outputFileName}).`;
                    logger.warn(message);
                    baseResult.diagnostics?.push({ line: 1, character: 0, message, severity: 'warning' });
                } else if (executionResult.code !== 0) {
                    logger.warn(`BLint failed (code ${executionResult.code}) and produced no output JSON file.`);
                    // Diagnostic for exit code should already be added
                } else { // code === 0 but directDiagnostics > 0
                    logger.info(`BLint finished, no JSON output, but found diagnostics in stdout/stderr.`);
                    // Diagnostics already added
                }
            } else {
                // Other file read error (e.g., permissions)
                const message = `Error reading BLint output file ${outputFileName}.`;
                logger.error(`${message} Error: ${readError.message}`, { file: sourceFilePath }, readError);
                baseResult.diagnostics?.push({
                    line: 1,
                    character: 0,
                    message: `${message} Error: ${readError.message}`,
                    severity: 'error'
                });
            }
             // Continue without predicates from JSON
        }

        // --- Function continues ---
        logger.debug(`Finished processing. Returning ${baseResult.diagnostics?.length || 0} diagnostics and ${baseResult.predicates.length} predicates.`);
        return baseResult;

    } catch (error: any) {
        // Catch errors during setup phase (e.g., temp dir creation, locator errors if it throws)
        const message = `Critical error during BLint analysis setup for ${sourceFilePath}: ${error.message}`;
        logger.error(message, error);
        baseResult.diagnostics = [{ line: 1, character: 0, message, severity: 'error' }];
        return baseResult;
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
