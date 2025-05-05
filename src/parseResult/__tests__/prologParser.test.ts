import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parseProlog, ParserDependencies } from '../prologParser';
import ParseResult, { SourceRange } from '../types';
import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { PrologServerSettings } from '../../types';
import FileSystem from '../../interfaces/fileSystem';
import CommandRunner, { CommandResult } from '../../interfaces/commandManager';
import TempManager from '../../interfaces/tempManager';
import BlintLocator from '../../interfaces/blintLocator';
import Logger from '../../interfaces/logger';
import PrologAst, { AstComment } from '../../ast/types';
import { transformAstToParseResult } from '../../ast/processor';

describe('prologParser.parseProlog (Dependency Injection)', () => {
    let mockFs: jest.Mocked<FileSystem>;
    let mockCommandRunner: jest.Mocked<CommandRunner>;
    let mockCommandRunnerFactory: jest.Mock<(executablePath: string, logger: Logger) => CommandRunner>;
    let mockTempManager: jest.Mocked<TempManager>;
    let mockBlintLocator: jest.Mocked<BlintLocator>;
    let parserDeps: ParserDependencies;
    let settings: PrologServerSettings;
    let mockLogger: jest.Mocked<Logger>;
    
    const defaultBlintPath = '/mock/bin/blint-valid';
    const sourcePath = 'file:///path/to/file.pl';
    const sourceText = 'test.';
    const tmpDir = '/tmp/mock-dir-123';
    const tmpFile = path.join(tmpDir, path.basename(sourcePath));
    const tmpJson = path.join(tmpDir, path.basename(sourcePath).replace('.pl', '.AST.json'));

    beforeEach(() => {
        // Provide type arguments to jest.fn() matching the FileSystem interface methods
        mockFs = {
            access: jest.fn<typeof fs.access>().mockResolvedValue(undefined),
            chmod: jest.fn<typeof fs.chmod>().mockResolvedValue(undefined),
            writeFile: jest.fn<typeof fs.writeFile>().mockResolvedValue(undefined),
            // For readFile, specify the expected string return type
            readFile: jest.fn<(...args: Parameters<FileSystem['readFile']>) => Promise<string>>()
            .mockResolvedValue('{}'), // Default empty JSON as string
            unlink: jest.fn<typeof fs.unlink>().mockResolvedValue(undefined),
            rm: jest.fn<typeof fs.rm>().mockResolvedValue(undefined),
            mkdir: jest.fn<typeof fs.mkdir>().mockResolvedValue(undefined),
            copyFile: jest.fn<typeof fs.copyFile>().mockResolvedValue(undefined),
            stat: jest.fn<FileSystem['stat']>().mockResolvedValue(undefined),
        };
        
        // Provide type arguments for CommandRunner execute method
        mockCommandRunner = {
            execute: jest.fn<(...args: string[]) => Promise<CommandResult>>()
            .mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
        };
        
        // Provide the function signature type argument to jest.fn()
        mockCommandRunnerFactory = jest.fn<(executablePath: string, logger: Logger) => CommandRunner>()
        .mockReturnValue(mockCommandRunner);
        
        // Provide type arguments for TempManager methods
        mockTempManager = {
            mkdtemp: jest.fn<(prefix: string) => Promise<string>>()
            .mockResolvedValue('/tmp/mock-dir-123'),
            cleanup: jest.fn<(dirPath: string | undefined) => Promise<void>>()
            .mockResolvedValue(undefined),
        };
        
        // Provide type arguments for BlintLocator method
        mockBlintLocator = {
            getBlintPath: jest.fn<(settings: PrologServerSettings) => Promise<string | null>>()
            .mockResolvedValue('/mock/bin/blint-valid'),
        };
        
        // Provide type arguments for Logger method
        mockLogger = {
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn(),
            debug: jest.fn(),
        };
        
        // Assemble the dependencies object (no change here)
        parserDeps = {
            fs: mockFs,
            commandRunnerFactory: mockCommandRunnerFactory,
            tempManager: mockTempManager,
            blintLocator: mockBlintLocator,
            logger: mockLogger,
        };
        
        // Default settings (no change here)
        settings = { blint: { path: null } };
    });
    
    it('should call dependencies correctly for a successful parse with detailed locations', async () => {
        // --- ARRANGE ---
        const sourcePath = 'file:///path/to/file.pl';
        const sourceText = 'pred1(A) :- pred2(A).'; // Example text
        const blintPath = defaultBlintPath;

        const mockJsonResult: PrologAst = {
            file: sourcePath,
            predicates: [{                
                type: 'rule', line: 1, column: 10,
                head: {
                    type: 'functor', line: 1, column: 1, name: 'pred1', arity: 1,
                    params: [{
                        type: 'var', line: 1, column: 7, name: 'A', raw: '1/7-var(A)'
                    }],
                    raw: '1/1-functor(pred1, 1, [param(1/7-var(A))])'
                },
                body: [{
                    type: 'functor', line: 1, column: 13, name: 'pred2', arity: 1,
                    params: [{
                        type: 'var', line: 1, column: 19, name: 'A', raw: '1/19-var(A)'
                    }],
                    raw: '1/13-functor(pred2, 1, [param(1/19-var(A))])'
                }],
                raw: [
                    '1/10-rule(1/1-functor(pred1, 1, [param(1/7-var(A))]))',
                    '1/13-functor(pred2, 1, [param(1/19-var(A))])'
                ]
            }]
        };

        mockFs.readFile.mockResolvedValue(JSON.stringify(mockJsonResult));
        mockCommandRunner.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
        mockBlintLocator.getBlintPath.mockResolvedValue(blintPath);
        
        // --- ACT ---
        const result = await parseProlog(sourcePath, sourceText, settings, parserDeps);

        // --- ASSERT ---
        // Verify mocks were called as expected
        expect(mockBlintLocator.getBlintPath).toHaveBeenCalledWith(settings);
        expect(mockTempManager.mkdtemp).toHaveBeenCalledWith(expect.stringContaining('prolog-lsp-parser-'));
        expect(mockFs.writeFile).toHaveBeenCalledWith(tmpFile, sourceText, 'utf-8');
        expect(mockFs.unlink).toHaveBeenCalledWith(tmpJson); // Attempted cleanup
        expect(mockCommandRunnerFactory).toHaveBeenCalledWith(blintPath, mockLogger); // Factory called with correct path
        expect(mockCommandRunner.execute).toHaveBeenCalledWith('-ec', '-ast', `-o${tmpDir}`, tmpFile);
        expect(mockFs.readFile).toHaveBeenCalledWith(tmpJson, { encoding: 'utf-8' });
        expect(mockTempManager.cleanup).toHaveBeenCalledWith(tmpDir);

        // Verify result structure matches the detailed mock data
        const mockTransformedResult = transformAstToParseResult(mockJsonResult);
        expect(result.predicates).toEqual(mockTransformedResult.predicates);
        expect(result.diagnostics).toEqual([]);
        expect(mockLogger.error).not.toHaveBeenCalled();
        expect(mockLogger.warn).not.toHaveBeenCalled();
    });
    
    it('should return diagnostic if blintLocator returns null', async () => {
        mockBlintLocator.getBlintPath.mockResolvedValue(null); // Simulate locator failure
        
        const result = await parseProlog(sourcePath, sourceText, settings, parserDeps);
        
        expect(mockBlintLocator.getBlintPath).toHaveBeenCalledWith(settings);
        // None of the other operations should have happened
        expect(mockTempManager.mkdtemp).not.toHaveBeenCalled();
        expect(mockCommandRunnerFactory).not.toHaveBeenCalled();
        expect(mockFs.readFile).not.toHaveBeenCalled();
        // Check diagnostic
        expect(result.diagnostics).toEqual(expect.arrayContaining([
            expect.objectContaining({
                message: expect.stringContaining('BLint path could not be determined'),
                severity: 'error'
            })
        ]));
        expect(result.predicates).toEqual([]);
    });
    
    it('should return diagnostic and log error if reading JSON output file fails (not ENOENT)', async () => {
        // ARRANGE
        const readError = new Error('EPERM: operation not permitted');
        (readError as any).code = 'EPERM'; // Add code property for specific check
        mockBlintLocator.getBlintPath.mockResolvedValue(defaultBlintPath); // Assume valid path
        mockCommandRunner.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '' }); // BLint runs ok
        mockFs.readFile.mockRejectedValue(readError); // Mock readFile to fail
        
        // ACT
        const result = await parseProlog(sourcePath, sourceText, settings, parserDeps);
        
        // ASSERT
        expect(mockCommandRunner.execute).toHaveBeenCalledTimes(1); // Ensure execute was attempted
        expect(mockFs.readFile).toHaveBeenCalledWith(tmpJson, { encoding: 'utf-8' }); // Ensure read was attempted
        expect(result.predicates).toEqual([]); // No predicates parsed
        // Check diagnostic for file read error
        expect(result.diagnostics).toEqual(expect.arrayContaining([
            expect.objectContaining({
                severity: 'error',
                message: expect.stringContaining(`Error reading BLint output file ${path.basename(tmpJson)}`)
            })
        ]));
        expect(result.diagnostics).toEqual(expect.arrayContaining([
            expect.objectContaining({ // Message includes the original error message
                message: expect.stringContaining(readError.message)
            })
        ]));
        expect(result.diagnostics).toHaveLength(1); // Should only be one diagnostic
        // Check logger
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining(`Error reading BLint output file ${path.basename(tmpJson)}`),
            expect.objectContaining({ file: sourcePath }), // Check meta object
            readError // Check error object
        );
    });
    
    it('should return diagnostic and log error if parsing JSON output fails', async () => {
        // ARRANGE
        const invalidJson = '{"predicates": [{}], "missing_stuff": true'; // Malformed JSON
        const expectedJsonErrorMsg = "Expected ',' or '}'";
        mockBlintLocator.getBlintPath.mockResolvedValue(defaultBlintPath);
        mockCommandRunner.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
        mockFs.readFile.mockResolvedValue(invalidJson); // Mock readFile returning bad JSON
        
        // ACT
        const result = await parseProlog(sourcePath, sourceText, settings, parserDeps);
        
        // ASSERT
        expect(mockCommandRunner.execute).toHaveBeenCalledTimes(1);
        expect(mockFs.readFile).toHaveBeenCalledTimes(1);
        expect(result.predicates).toEqual([]);
        // Check diagnostic for JSON parse error
        expect(result.diagnostics).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    severity: 'error',
                    message: expect.stringContaining(`Error processing BLint AST JSON output in ${path.basename(tmpJson)}`),
                })
            ])
        );
        expect(result.diagnostics?.[0]?.message).toMatch(/Error:.*JSON/i);
        expect(result.diagnostics).toHaveLength(1);
        // Check logger
        expect(mockLogger.error).toHaveBeenCalledTimes(1);
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining(`Error processing BLint AST JSON output in ${path.basename(tmpJson)}`),
            expect.objectContaining({
                file: sourcePath,
                error: expect.stringContaining(expectedJsonErrorMsg), // Check the specific JSON error msg
                contentStart: expect.stringContaining(invalidJson + '...')
            })
        );
    });
    
    it('should return diagnostic and log error if JSON structure is invalid (no predicates array)', async () => {
        // ARRANGE
        const invalidStructureJson = '{"file": "abc", "diagnostics": []}'; // Missing 'predicates'
        mockBlintLocator.getBlintPath.mockResolvedValue(defaultBlintPath);
        mockCommandRunner.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
        mockFs.readFile.mockResolvedValue(invalidStructureJson);
        
        // ACT
        const result = await parseProlog(sourcePath, sourceText, settings, parserDeps);
        
        // ASSERT
        expect(result.predicates).toEqual([]);
        expect(result.diagnostics).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    severity: 'error',
                    message: expect.stringContaining(`Error processing BLint AST JSON output in ${path.basename(tmpJson)}`),
                })
            ])
        );
        expect(result.diagnostics).toHaveLength(1);
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining(`Error processing BLint AST JSON output in ${path.basename(tmpJson)}`),
            expect.objectContaining({
                file: sourcePath,
                error: 'ast.predicates is not iterable',
                contentStart: expect.stringContaining(invalidStructureJson + '...')
            })
        );
    });
    
    
    it('should return warning diagnostic if BLint runs successfully but produces no JSON and no stderr/stdout diags', async () => {
        // ARRANGE
        mockBlintLocator.getBlintPath.mockResolvedValue(defaultBlintPath);
        mockCommandRunner.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '' }); // Success, empty streams
        mockFs.readFile.mockRejectedValue({ code: 'ENOENT' }); // Simulate JSON file not found
        
        // ACT
        const result = await parseProlog(sourcePath, sourceText, settings, parserDeps);
        
        // ASSERT
        expect(mockCommandRunner.execute).toHaveBeenCalledTimes(1);
        expect(mockFs.readFile).toHaveBeenCalledTimes(1);
        expect(result.predicates).toEqual([]);
        // Check for the specific warning
        expect(result.diagnostics).toEqual(expect.arrayContaining([
            expect.objectContaining({
                severity: 'warning',
                message: expect.stringContaining('BLint ran successfully but produced no output JSON file')
            })
        ]));
        expect(result.diagnostics).toHaveLength(1);
        // Check logger
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining('BLint ran successfully but produced no output JSON file')
        );
    });
    
    it('should handle errors during temporary directory creation', async () => {
        // ARRANGE
        const tempError = new Error('Failed to create temp dir');
        mockBlintLocator.getBlintPath.mockResolvedValue(defaultBlintPath); // Path finding ok
        mockTempManager.mkdtemp.mockRejectedValue(tempError); // Mock temp dir creation to fail
        
        // ACT
        const result = await parseProlog(sourcePath, sourceText, settings, parserDeps);
        
        // ASSERT
        expect(mockBlintLocator.getBlintPath).toHaveBeenCalledTimes(1); // Called before temp dir
        expect(mockTempManager.mkdtemp).toHaveBeenCalledTimes(1); // Attempted to create temp dir
        expect(mockFs.writeFile).not.toHaveBeenCalled(); // Should not proceed
        expect(mockCommandRunnerFactory).not.toHaveBeenCalled(); // Should not proceed
        // Check diagnostic
        expect(result.diagnostics).toEqual(expect.arrayContaining([
            expect.objectContaining({
                severity: 'error',
                message: expect.stringContaining(`Critical error during BLint analysis setup`)
            }),
            expect.objectContaining({ // Check specific error message
                message: expect.stringContaining(tempError.message)
            })
        ]));
        expect(result.diagnostics).toHaveLength(1);
        // Check logger
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining(`Critical error during BLint analysis setup`),
            tempError // Check the original error was logged
        );
    });
    
    it('should still attempt cleanup even if reading/parsing JSON fails', async () => {
        // ARRANGE
        mockBlintLocator.getBlintPath.mockResolvedValue(defaultBlintPath);
        mockCommandRunner.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
        mockFs.readFile.mockRejectedValue(new Error('Read Failed')); // Simulate read failure
        
        // ACT
        await parseProlog(sourcePath, sourceText, settings, parserDeps);
        
        // ASSERT
        expect(mockTempManager.cleanup).toHaveBeenCalledWith(tmpDir); // Assert cleanup was called
    });
    
    it('should still attempt cleanup even if BLint execution fails', async () => {
        // ARRANGE
        const execError = new Error('BLint Crashed');
        mockBlintLocator.getBlintPath.mockResolvedValue(defaultBlintPath);
        mockCommandRunner.execute.mockRejectedValue(execError); // Simulate execute failure (different from non-zero exit)
        
        // ACT
        await parseProlog(sourcePath, sourceText, settings, parserDeps);
        
        // ASSERT
        expect(mockTempManager.cleanup).toHaveBeenCalledWith(tmpDir); // Assert cleanup was called
    });
});