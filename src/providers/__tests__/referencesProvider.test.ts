import { ReferenceParams, ReferenceContext, Location, Position } from 'vscode-languageserver/node';
import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import AnalysisCache, { ReferenceInfo } from '../../interfaces/analysisCache';
import ParseResult, { SourceRange } from '../../parseResult/types';
import { blintRangeToLspRange } from '../../parseResult/rangeUtils';
import { provideReferences } from '../referencesProvider';

describe('referencesProvider.provideReferences', () => {
    let mockCache: jest.Mocked<AnalysisCache>;
    let mockParams: ReferenceParams;
    let mockUri1: string;
    let mockUri2: string;
    let mockPositionOnDef: Position;
    let mockPositionOnCall: Position;
    let mockContextIncludeDef: ReferenceContext;
    let mockContextExcludeDef: ReferenceContext;

    // Define ranges used in mock data
    const defRangePred1: SourceRange = { startLine: 3, startCharacter: 0, endLine: 3, endCharacter: 5 }; // "pred1"
    const call1RangePred1: SourceRange = { startLine: 7, startCharacter: 4, endLine: 7, endCharacter: 9 }; // "pred1" call in file1
    const call2RangePred1: SourceRange = { startLine: 9, startCharacter: 10, endLine: 9, endCharacter: 15 }; // "pred1" call in file2
    const defRangePred2: SourceRange = { startLine: 15, startCharacter: 0, endLine: 15, endCharacter: 5 }; // "pred2"

    // Define mock ParseResult data
    let mockParseResult1: ParseResult;
    let mockParseResult2: ParseResult;
    let mockReferencesResult: ReferenceInfo[];

    beforeEach(() => {
        mockUri1 = 'file:///project/file1.pl';
        mockUri2 = 'file:///project/file2.pl';
        mockPositionOnDef = Position.create(2, 2); // Line 3, char 2 (on pred1 definition)
        mockPositionOnCall = Position.create(6, 6); // Line 7, char 6 (on pred1 call in file1)
        mockContextIncludeDef = { includeDeclaration: true };
        mockContextExcludeDef = { includeDeclaration: false };

        // --- Setup Mock Parse Results ---
        mockParseResult1 = {
            filePath: '/project/file1.pl', // File containing definition and a call
            predicates: [
                {
                    name: 'pred1', arity: 0, startLine: 3, endLine: 3,
                    definitionRange: defRangePred1,
                    calls: [] // pred1 calls nothing
                },
                {
                    name: 'caller1', arity: 1, startLine: 6, endLine: 8,
                    definitionRange: { startLine: 6, startCharacter: 0, endLine: 6, endCharacter: 7 },
                    calls: [ // Calls pred1
                        { name: 'pred1', arity: 0, location: call1RangePred1 }
                    ]
                }
            ],
            diagnostics: []
        };
        mockParseResult2 = {
            filePath: '/project/file2.pl', // File containing another call
            predicates: [
                {
                    name: 'caller2', arity: 0, startLine: 9, endLine: 11,
                    definitionRange: { startLine: 9, startCharacter: 0, endLine: 9, endCharacter: 7 },
                    calls: [ // Calls pred1
                         { name: 'pred1', arity: 0, location: call2RangePred1 }
                    ]
                },
                 {
                    name: 'pred2', arity: 1, startLine: 15, endLine: 15, // Another predicate, not called/calling pred1
                    definitionRange: defRangePred2,
                    calls: []
                 }
            ],
            diagnostics: []
        };

        // --- Define the expected result for findReferences ---
        mockReferencesResult = [
            { uri: mockUri1, call: mockParseResult1.predicates[1].calls[0], callingPredicate: mockParseResult1.predicates[1] }, // Call in file1
            { uri: mockUri2, call: mockParseResult2.predicates[0].calls[0], callingPredicate: mockParseResult2.predicates[0] }  // Call in file2
        ];

        // --- Mock AnalysisCache ---
        mockCache = {
            get: jest.fn(), // Not directly used by provider, but maybe by findElement/findDef
            set: jest.fn(), delete: jest.fn(), clear: jest.fn(),
            findElementAtPosition: jest.fn(),
            findDefinitionByNameArity: jest.fn(),
            findReferences: jest.fn<(targetName: string, targetArity: number) => ReferenceInfo[]>().mockReturnValue(mockReferencesResult)
        };

        mockParams = {
            textDocument: { uri: mockUri1 },
            position: mockPositionOnDef,
            context: mockContextIncludeDef
        };
    });

    it('should return null if element is not found at position', async () => {
        mockCache.findElementAtPosition.mockReturnValue(undefined);
        const result = await provideReferences(mockParams, mockCache as AnalysisCache);
        expect(result).toBeNull();
        expect(mockCache.findElementAtPosition).toHaveBeenCalledWith(mockUri1, mockPositionOnDef);
        expect(mockCache.findReferences).not.toHaveBeenCalled();
    });

    it('should find all call locations when starting from definition (excluding declaration)', async () => {
        mockParams.position = mockPositionOnDef;
        mockParams.context = mockContextExcludeDef;
        mockCache.findElementAtPosition.mockReturnValue({
            type: 'definition', predicate: mockParseResult1.predicates[0], uri: mockUri1
        });
        // findReferences will return the mockReferencesResult defined in beforeEach

        const result = await provideReferences(mockParams, mockCache as AnalysisCache);

        expect(result).toBeDefined();
        expect(mockCache.findElementAtPosition).toHaveBeenCalledWith(mockUri1, mockPositionOnDef);
        expect(mockCache.findReferences).toHaveBeenCalledWith('pred1', 0);
        expect(result).toHaveLength(2);
        expect(result).toEqual(expect.arrayContaining([ // Check result based on mockReferencesResult
            Location.create(mockUri1, blintRangeToLspRange(call1RangePred1)),
            Location.create(mockUri2, blintRangeToLspRange(call2RangePred1)),
        ]));
        expect(mockCache.findDefinitionByNameArity).not.toHaveBeenCalled();
    });

    it('should find all call locations when starting from a call (excluding declaration)', async () => {
        mockParams.position = mockPositionOnCall;
        mockParams.context = mockContextExcludeDef;
        mockCache.findElementAtPosition.mockReturnValue({
            type: 'call', call: mockParseResult1.predicates[1].calls[0], callingPredicate: mockParseResult1.predicates[1], uri: mockUri1
        });
        // findReferences will return the mockReferencesResult defined in beforeEach

        const result = await provideReferences(mockParams, mockCache as AnalysisCache);

        expect(result).toBeDefined();
        expect(mockCache.findElementAtPosition).toHaveBeenCalledWith(mockUri1, mockPositionOnCall);
        expect(mockCache.findReferences).toHaveBeenCalledWith('pred1', 0);
        expect(result).toHaveLength(2);
        expect(result).toEqual(expect.arrayContaining([
            Location.create(mockUri1, blintRangeToLspRange(call1RangePred1)),
            Location.create(mockUri2, blintRangeToLspRange(call2RangePred1)),
        ]));
         expect(mockCache.findDefinitionByNameArity).not.toHaveBeenCalled();
    });

    it('should find all call locations AND definition when starting from definition (including declaration)', async () => {
        mockParams.position = mockPositionOnDef;
        mockParams.context = mockContextIncludeDef;
        mockCache.findElementAtPosition.mockReturnValue({
            type: 'definition', predicate: mockParseResult1.predicates[0], uri: mockUri1
        });
        mockCache.findDefinitionByNameArity.mockReturnValue({ // Mock definition lookup
             uri: mockUri1, predicate: mockParseResult1.predicates[0]
        });
        // findReferences returns mockReferencesResult

        const result = await provideReferences(mockParams, mockCache as AnalysisCache);

        expect(result).toBeDefined();
        expect(mockCache.findElementAtPosition).toHaveBeenCalledWith(mockUri1, mockPositionOnDef);
        expect(mockCache.findReferences).toHaveBeenCalledWith('pred1', 0);
        expect(mockCache.findDefinitionByNameArity).toHaveBeenCalledWith('pred1', 0);
        expect(result).toHaveLength(3); // Calls + Definition
        expect(result).toEqual(expect.arrayContaining([
            Location.create(mockUri1, blintRangeToLspRange(call1RangePred1)),
            Location.create(mockUri2, blintRangeToLspRange(call2RangePred1)),
            Location.create(mockUri1, blintRangeToLspRange(defRangePred1)), // Definition included
        ]));
    });

     it('should find all call locations AND definition when starting from call (including declaration)', async () => {
         mockParams.position = mockPositionOnCall;
         mockParams.context = mockContextIncludeDef;
         mockCache.findElementAtPosition.mockReturnValue({
             type: 'call', call: mockParseResult1.predicates[1].calls[0], callingPredicate: mockParseResult1.predicates[1], uri: mockUri1
         });
         mockCache.findDefinitionByNameArity.mockReturnValue({
              uri: mockUri1, predicate: mockParseResult1.predicates[0]
         });
          // findReferences returns mockReferencesResult

         const result = await provideReferences(mockParams, mockCache as AnalysisCache);

         expect(result).toBeDefined();
         expect(mockCache.findElementAtPosition).toHaveBeenCalledWith(mockUri1, mockPositionOnCall);
         expect(mockCache.findReferences).toHaveBeenCalledWith('pred1', 0);
         expect(mockCache.findDefinitionByNameArity).toHaveBeenCalledWith('pred1', 0);
         expect(result).toHaveLength(3);
         expect(result).toEqual(expect.arrayContaining([
            Location.create(mockUri1, blintRangeToLspRange(call1RangePred1)),
            Location.create(mockUri2, blintRangeToLspRange(call2RangePred1)),
            Location.create(mockUri1, blintRangeToLspRange(defRangePred1)), // Definition included
        ]));
     });

     it('should return empty array if no calls found (excluding declaration)', async () => {
         mockParams.position = Position.create(14, 2); // On pred2 definition
         mockParams.textDocument.uri = mockUri2;
         mockParams.context = mockContextExcludeDef;
         mockCache.findElementAtPosition.mockReturnValue({
             type: 'definition', predicate: mockParseResult2.predicates[1], uri: mockUri2
         });
         mockCache.findReferences.mockReturnValue([]);

         const result = await provideReferences(mockParams, mockCache as AnalysisCache);

         expect(result).toEqual([]);
         expect(mockCache.findElementAtPosition).toHaveBeenCalledWith(mockUri2, mockParams.position);
         expect(mockCache.findReferences).toHaveBeenCalledWith('pred2', 1);
         expect(mockCache.findDefinitionByNameArity).not.toHaveBeenCalled();
     });

      it('should return only definition if no calls found (including declaration)', async () => {
          mockParams.position = Position.create(14, 2); // On pred2 definition
          mockParams.textDocument.uri = mockUri2;
          mockParams.context = mockContextIncludeDef;
          mockCache.findElementAtPosition.mockReturnValue({
              type: 'definition', predicate: mockParseResult2.predicates[1], uri: mockUri2
          });
          mockCache.findReferences.mockReturnValue([]);
          mockCache.findDefinitionByNameArity.mockReturnValue({
               uri: mockUri2, predicate: mockParseResult2.predicates[1]
          });

          const result = await provideReferences(mockParams, mockCache as AnalysisCache);

          expect(result).toHaveLength(1);
          expect(result).toEqual([ Location.create(mockUri2, blintRangeToLspRange(defRangePred2)) ]); // Only definition
          expect(mockCache.findElementAtPosition).toHaveBeenCalledWith(mockUri2, mockParams.position);
          expect(mockCache.findReferences).toHaveBeenCalledWith('pred2', 1);
          expect(mockCache.findDefinitionByNameArity).toHaveBeenCalledWith('pred2', 1);
      });
});
