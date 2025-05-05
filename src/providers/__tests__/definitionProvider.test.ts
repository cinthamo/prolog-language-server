import { TextDocumentPositionParams, Location, Position } from 'vscode-languageserver/node';
import AnalysisCache from '../../interfaces/analysisCache';
import { provideDefinition } from '../definitionProvider';
import ParseResult, { SourceRange } from '../../parseResult/types';
import { describe, expect, it, beforeEach, jest } from '@jest/globals';

describe('definitionProvider.provideDefinition', () => {
    let mockCache: jest.MockedObject<AnalysisCache>;
    let mockParams: TextDocumentPositionParams;
    let mockUri: string;
    let mockPosition: Position;
    let mockDefinitionRange: SourceRange;
    let mockCallLocation: SourceRange;
    let mockTargetDefinitionRange: SourceRange;
    let mockParseResult: ParseResult;

    beforeEach(() => {
        mockUri = 'file:///path/to/test.pl';
        mockDefinitionRange = { startLine: 5, startCharacter: 0, endLine: 5, endCharacter: 5 }; // pred1
        mockCallLocation = { startLine: 5, startCharacter: 15, endLine: 5, endCharacter: 20 }; // pred2 call
        mockTargetDefinitionRange = { startLine: 10, startCharacter: 0, endLine: 10, endCharacter: 5 }; // pred2 definition

        // Mock ParseResult with detailed locations
        mockParseResult = {
            filePath: '/path/to/test.pl', // Note: cache uses URI string as key
            predicates: [
                {
                    name: 'pred1', arity: 1, startLine: 5, endLine: 5,
                    definitionRange: mockDefinitionRange,
                    calls: [{ name: 'pred2', arity: 1, location: mockCallLocation }]
                },
                {
                    name: 'pred2', arity: 1, startLine: 10, endLine: 10,
                    definitionRange: mockTargetDefinitionRange,
                    calls: []
                }
            ],
            diagnostics: []
        };

        // Mock AnalysisCache methods used by provideDefinition
        mockCache = {
            get: jest.fn(),
            set: jest.fn(),
            delete: jest.fn(),
            clear: jest.fn(),
            findElementAtPosition: jest.fn(),
            findDefinitionByNameArity: jest.fn(),
            findReferences: jest.fn(),
        };

        // Default setup: Return the mock parse result when cache is queried for the test URI
        // (We'll override findElementAtPosition/findDefinitionByNameArity in specific tests)
        mockCache.get.mockReturnValue(mockParseResult); // Needed if findElement iterates internally

        mockPosition = Position.create(0, 0); // Default position, override in tests
        mockParams = { textDocument: { uri: mockUri }, position: mockPosition };
    });

    it('should return null if element is not found at position', () => {
        mockCache.findElementAtPosition.mockReturnValue(undefined); // Simulate not finding anything

        const result = provideDefinition(mockParams, mockCache as AnalysisCache);

        expect(result).toBeNull();
        expect(mockCache.findElementAtPosition).toHaveBeenCalledWith(mockUri, mockPosition);
    });

    it('should return definition location if cursor is on a definition', () => {
        mockPosition = Position.create(4, 2); // Line 5, char 2 (inside "pred1")
        mockParams.position = mockPosition;
        // Simulate finding the definition at the position
        mockCache.findElementAtPosition.mockReturnValue({
            type: 'definition',
            predicate: mockParseResult.predicates[0], // The pred1 definition
            uri: mockUri
        });

        const result = provideDefinition(mockParams, mockCache as AnalysisCache);

        expect(result).toBeDefined();
        expect(result).toEqual(Location.create(
            mockUri,
            { start: { line: 4, character: 0 }, end: { line: 4, character: 5 } } // Expected LSP Range for pred1 def
        ));
        expect(mockCache.findElementAtPosition).toHaveBeenCalledWith(mockUri, mockPosition);
        expect(mockCache.findDefinitionByNameArity).not.toHaveBeenCalled(); // Shouldn't need lookup
    });

    it('should return definition location if cursor is on a call', () => {
        mockPosition = Position.create(4, 17); // Line 5, char 17 (inside "pred2" call)
        mockParams.position = mockPosition;
        // Simulate finding the call at the position
        mockCache.findElementAtPosition.mockReturnValue({
            type: 'call',
            call: mockParseResult.predicates[0].calls[0], // The pred2 call info
            callingPredicate: mockParseResult.predicates[0],
            uri: mockUri
        });
         // Simulate finding the definition for the call target
        mockCache.findDefinitionByNameArity.mockReturnValue({
             uri: mockUri, // Assume definition is in the same file for simplicity
             predicate: mockParseResult.predicates[1] // The pred2 definition info
        });


        const result = provideDefinition(mockParams, mockCache as AnalysisCache);

        expect(result).toBeDefined();
        expect(result).toEqual(Location.create(
            mockUri, // URI where pred2 is defined
            { start: { line: 9, character: 0 }, end: { line: 9, character: 5 } } // Expected LSP Range for pred2 def
        ));
        expect(mockCache.findElementAtPosition).toHaveBeenCalledWith(mockUri, mockPosition);
         // Ensure it looked up the definition for the call target
        expect(mockCache.findDefinitionByNameArity).toHaveBeenCalledWith('pred2', 1);
    });

     it('should return null if cursor is on a call but definition is not found', () => {
        mockPosition = Position.create(4, 17); // On pred2 call
        mockParams.position = mockPosition;
        mockCache.findElementAtPosition.mockReturnValue({
            type: 'call',
            call: mockParseResult.predicates[0].calls[0],
            callingPredicate: mockParseResult.predicates[0],
            uri: mockUri
        });
        // Simulate definition NOT being found
        mockCache.findDefinitionByNameArity.mockReturnValue(undefined);

        const result = provideDefinition(mockParams, mockCache as AnalysisCache);

        expect(result).toBeNull();
         expect(mockCache.findDefinitionByNameArity).toHaveBeenCalledWith('pred2', 1);
     });
});
