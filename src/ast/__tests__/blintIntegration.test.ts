import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as tmp from 'tmp';
import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';

// Import the function under test and its dependencies/types
import { parseProlog, ParserDependencies } from '../../parseResult/prologParser';
import { PrologServerSettings, defaultSettings } from '../../types';
import Logger from '../../interfaces/logger';
import TempManager from '../../interfaces/tempManager';

// Import the *real* dependency implementations
import realFileSystem from '../../utils/realFileSystem';
import RealCommandRunner from '../../utils/realCommandRunner';
import realBlintLocator from '../../utils/realBlintLocator';
import PrologAst from '../types';
import { transformAstToParseResult } from '../processor';

// --- Test Configuration ---
let testFilesDir: string; // Need a place to write test files

// --- Mock Logger for Tests ---
// Suppress logs during integration tests unless needed for debugging
const mockLogger: jest.Mocked<Logger> = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
};

// --- Mock TempManager for Tests ---
let mockTempManager: jest.Mocked<TempManager> = {
    mkdtemp: jest.fn(),
    cleanup: jest.fn(),
};

// --- Real Dependencies (except Logger) ---
// Construct the dependencies object using the real implementations
let realParserDeps: ParserDependencies;

// --- Helper Function ---
const createTempPrologFile = async (fileName: string, content: string): Promise<string> => {
    // Ensure the directory exists before writing
    await fs.mkdir(testFilesDir, { recursive: true });
    const filePath = path.join(testFilesDir, fileName);
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
};


// --- Test Suite Setup ---
beforeAll(async () => {
    // Setup real dependencies object *once*
    realParserDeps = {
        fs: realFileSystem,
        commandRunnerFactory: (executablePath: string, logger: Logger) => new RealCommandRunner(executablePath, logger),
        tempManager: mockTempManager,
        blintLocator: realBlintLocator(mockLogger),
        logger: mockLogger
    };

    // Determine if BLint can be found and is executable *once*
    const defaultTestSettings: PrologServerSettings = { ...defaultSettings };
    const locatedPath = await realParserDeps.blintLocator.getBlintPath(defaultTestSettings);
    const blintCanRun = !!locatedPath; // Set flag based on locator result

    if (!blintCanRun) {
        console.warn("\n************************************************************");
        console.warn("WARNING: Could not locate/validate BLint executable.");
        console.warn("BLint integration tests will be skipped.");
        console.warn("Ensure BLint is bundled correctly or configure path if needed.");
        console.warn("************************************************************\n");
    } else {
        console.log(`BLint Integration Tests: Using BLint located at: ${locatedPath}`);
    }

    // Create a temporary directory just for writing the test .pl files
    testFilesDir = await new Promise<string>((resolve, reject) => {
        tmp.dir({ unsafeCleanup: true, prefix: 'blint-test-files-' }, (err, name) => err ? reject(err) : resolve(name));
    });
    mockTempManager.mkdtemp.mockResolvedValue(testFilesDir);
    console.log(`BLint Integration Tests: Test files will be written to: ${testFilesDir}`);
});

afterAll(async () => {
    // Cleanup the temporary directory holding test files
    if (testFilesDir) {
        await fs.rm(testFilesDir, { recursive: true, force: true }).catch(e => console.error("Error cleaning test files temp dir", e));
        console.log(`BLint Integration Tests: Cleaned up test files dir: ${testFilesDir}`);
    }
    // tmp library handles cleanup for dirs created *by realTempManager* if unsafeCleanup is true
});

// --- Test Suite Definition ---
describe('BLint Integration Tests (using parseProlog)', () => {

    // Test case using the conditional skip
    it('should parse a simple fact and definition correctly', async () => {
        // ARRANGE
        const fileContent = `
fact.

% comment
rule_head(A) :-
    write(A).
`;
        const filePath = await createTempPrologFile('simple.pl', fileContent);
        const settings: PrologServerSettings = { blint: { path: null, args: ['-ilnt106', '-ilnt108'] } }; // Use bundled BLint, LNT 106 predicate not used, LNT 108 no public predicates

        // ACT
        const result = await parseProlog(filePath, fileContent, settings, realParserDeps);

        // ASSERT
        expect(result).toBeDefined();
        expect(result.success).toEqual(true);
        if (result.success === true) {
            const parseResult = transformAstToParseResult(result.ast, mockLogger);
            expect(parseResult.predicates).toHaveLength(2);

            // Check fact.
            const factPred = parseResult.predicates.find(p => p.name === 'fact');
            expect(factPred).toBeDefined();
            expect(factPred?.arity).toEqual(0);
            expect(factPred?.definitionRange).toEqual({ startLine: 2, startCharacter: 0, endLine: 2, endCharacter: 4 });
            expect(factPred?.fullRange).toEqual({ startLine: 2, startCharacter: 0, endLine: 2, endCharacter: 5 });
            expect(factPred?.calls).toEqual([]);

            // Check rule_head(A) :- write(A).
            const ruleHeadPred = parseResult.predicates.find(p => p.name === 'rule_head');
            expect(ruleHeadPred).toBeDefined();
            expect(ruleHeadPred?.arity).toEqual(1);
            expect(ruleHeadPred?.definitionRange).toEqual({ startLine: 5, startCharacter: 0, endLine: 5, endCharacter: 9 });
            expect(ruleHeadPred?.fullRange).toEqual({ startLine: 4, startCharacter: 0, endLine: 6, endCharacter: 13 });
            expect(ruleHeadPred?.calls).toHaveLength(1);
            expect(ruleHeadPred?.calls[0].name).toEqual('write');
            expect(ruleHeadPred?.calls[0].arity).toEqual(1); // Assuming BLint identifies built-in arity
            expect(ruleHeadPred?.calls[0].location).toBeDefined();
            expect(ruleHeadPred?.calls[0].location.startLine).toEqual(6); // write(A) is on Line 6
            // Add precise character checks if stable/needed
        }
    });

    it('should identify calls between predicates correctly', async () => {
        // ARRANGE
        const fileContent = `
main :- sub(1).
sub(X) :- helper(X).
helper(Y) :- write(Y).
`;
        const filePath = await createTempPrologFile('calls.pl', fileContent);
        const settings: PrologServerSettings = { blint: { path: null } };

        // ACT
        const result = await parseProlog(filePath, fileContent, settings, realParserDeps);

        // ASSERT
        expect(result).toBeDefined();
        expect(result.success).toEqual(true);
        if (result.success === true) {
            const parseResult = transformAstToParseResult(result.ast, mockLogger);
            expect(parseResult.predicates).toHaveLength(3);

            const mainPred = parseResult.predicates.find(p => p.name === 'main');
            expect(mainPred?.calls).toHaveLength(1);
            expect(mainPred?.calls[0].name).toEqual('sub');
            expect(mainPred?.calls[0].arity).toEqual(1);
            expect(mainPred?.calls[0].location?.startLine).toEqual(2); // main :- sub(1).

            const subPred = parseResult.predicates.find(p => p.name === 'sub');
            expect(subPred?.calls).toHaveLength(1);
            expect(subPred?.calls[0].name).toEqual('helper');
            expect(subPred?.calls[0].arity).toEqual(1);
            expect(subPred?.calls[0].location?.startLine).toEqual(3); // sub(X) :- helper(X).

            const helperPred = parseResult.predicates.find(p => p.name === 'helper');
            expect(helperPred?.calls).toHaveLength(1);
            expect(helperPred?.calls[0].name).toEqual('write');
            expect(helperPred?.calls[0].arity).toEqual(1);
            expect(helperPred?.calls[0].location?.startLine).toEqual(4); // helper(Y) :- write(Y).
        }
    });

    it('should produce diagnostics for syntax errors correctly', async () => {
        // ARRANGE
        const fileContent = `
error_rule(A) :-
    write(A) % Missing period
another_fact.
`;
        const filePath = await createTempPrologFile('error.pl', fileContent);
        const settings: PrologServerSettings = { blint: { path: null } };

        // ACT
        const result = await parseProlog(filePath, fileContent, settings, realParserDeps);

        // ASSERT
        expect(result).toBeDefined();
        expect(result.success).toEqual(true);
        if (result.success === true) {
            expect(result.ast.predicates).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    kind: 'syntax'
                })
            ]));
        }
    });

    it('should allow using a configured BLint path', async () => {
        // ARRANGE
        // Create a dummy script to act as a fake BLint for this test ONLY
        const fakeParsedAst = {
            file: "PLACEHOLDER_INPUT_PATH",
            predicates: [{
                type: "fact",
                line: 1,
                column: 1,
                head: {
                    type: "atom",
                    line: 1,
                    column: 1,
                    text: "fake_pred",
                    raw: "1/1-atom(fake_pred)"
                },
                raw: ["1/1-fact(1/1-atom(fake_pred))"]
            }]
        };
        const fakeBlintContent = 
`#!/bin/sh
# Fake BLint for testing configuration path

# Extract the output directory path from argument $3 (which is like -o/path/to/dir)
# Remove the leading '-o'
OUTPUT_DIR=${'${3#-o}'}

# Extract the input file path (argument $4)
INPUT_FILE=$4

# Construct the expected output JSON file name based on the *input* file name
OUTPUT_BASENAME=$(basename "$INPUT_FILE" .pl) # Get 'config' from '/path/to/config.pl'
OUTPUT_JSON_FILE="$OUTPUT_DIR/${'${OUTPUT_BASENAME}'}.AST.json"

# Create the output directory if it doesn't exist (good practice)
mkdir -p "$OUTPUT_DIR"

# Write the predefined JSON content to the calculated output file path
# Use printf for better compatibility than echo, especially with complex JSON
printf '%s' \
'${JSON.stringify(fakeParsedAst)}' \
> "$OUTPUT_JSON_FILE"

# Important: Replace the placeholder filePath in the JSON with the actual input file path ($3)
# Use sed for cross-platform compatibility (more reliable than trying variable expansion in JSON string)
# Note the use of different delimiters '#' for sed because $INPUT_FILE might contain '/'
sed -i.bak "s#PLACEHOLDER_INPUT_PATH#${'${INPUT_FILE}'}#g" "$OUTPUT_JSON_FILE"
rm -f "$OUTPUT_JSON_FILE.bak" # Clean up sed backup file

exit 0 # Indicate success
`;
        const fakeBlintPath = path.join(testFilesDir, 'fake_blint.sh');
        await fs.writeFile(fakeBlintPath, fakeBlintContent, { mode: 0o755 }); // Make executable

        // Use settings to point to the fake script
        const settings: PrologServerSettings = { blint: { path: fakeBlintPath } };

        const fileContent = `fake_pred.`;
        const filePathPl = await createTempPrologFile('config.pl', fileContent);

        // ACT
        const parseResult = await parseProlog(filePathPl, fileContent, settings, realParserDeps);

        // ASSERT
        expect(parseResult).toBeDefined();
        expect(parseResult.success).toEqual(true);
        if (parseResult.success === true) {
            expect(parseResult.ast.predicates).toEqual(fakeParsedAst.predicates);
        }
    });

    // Add more integration tests for different syntax, modules, edge cases...
});
