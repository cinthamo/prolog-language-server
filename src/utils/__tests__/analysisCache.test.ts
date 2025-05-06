import { describe, expect, it, beforeEach } from '@jest/globals';
import ParseResult, { SourceRange } from '../../parseResult/types';
import RealAnalysisCache from '../realAnalysisCache';
import AnalysisCache, { ReferenceInfo } from '../../interfaces/analysisCache';
import Logger from '../../interfaces/logger';

describe('AnalysisCache', () => {
    let cache: AnalysisCache;
    const uri1 = 'file:///project/file1.pl';
    const uri2 = 'file:///project/file2.pl';
    let result1: ParseResult;
    let result2: ParseResult;
    let mockLogger: jest.Mocked<Logger>;
    
    // Define some ranges for clarity
    const defRangePred1: SourceRange = { startLine: 3, startCharacter: 0, endLine: 3, endCharacter: 5 };
    const callLocationInCaller1: SourceRange = { startLine: 7, startCharacter: 4, endLine: 7, endCharacter: 9 };
    const defRangeCaller1: SourceRange = { startLine: 6, startCharacter: 0, endLine: 6, endCharacter: 7 };
    const defRangePred2: SourceRange = { startLine: 10, startCharacter: 0, endLine: 10, endCharacter: 5 };
    
    beforeEach(() => {
        mockLogger = {
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn(),
            debug: jest.fn(),
        };

        cache = new RealAnalysisCache(mockLogger);
        
        result1 = {
            filePath: '/project/file1.pl',
            predicates: [
                { // pred1/0 definition
                    name: 'pred1', arity: 0, startLine: 3, endLine: 3,
                    definitionRange: defRangePred1,
                    calls: []
                },
                { // caller1/1 definition (calls pred1/0)
                    name: 'caller1', arity: 1, startLine: 6, endLine: 8,
                    definitionRange: defRangeCaller1,
                    calls: [
                        { name: 'pred1', arity: 0, location: callLocationInCaller1 } // <<< This call is the reference *to* pred1/0
                    ]
                }
            ],
            diagnostics: []
        };
         result2 = {
            filePath: '/project/file2.pl',
            predicates: [
                 { // pred2/1 definition (calls nothing relevant)
                    name: 'pred2', arity: 1, startLine: 10, endLine: 10,
                    definitionRange: defRangePred2,
                    calls: []
                 }
             ],
            diagnostics: []
        };
    });
    
    it('should set and get items', () => {
        cache.set(uri1, result1);
        expect(cache.get(uri1)).toEqual(result1);
        expect(cache.get(uri2)).toBeUndefined();
    });
    
    it('should delete items', () => {
        cache.set(uri1, result1);
        cache.delete(uri1);
        expect(cache.get(uri1)).toBeUndefined();
    });
    
    it('should clear all items', () => {
        cache.set(uri1, result1);
        cache.set(uri2, result2);
        cache.clear();
        expect(cache.get(uri1)).toBeUndefined();
        expect(cache.get(uri2)).toBeUndefined();
    });
    
    it('should find definitions by name/arity', () => {
        cache.set(uri1, result1);
        cache.set(uri2, result2);
        const found = cache.findDefinitionByNameArity('pred2', 1);
        expect(found).toBeDefined();
        expect(found?.uri).toEqual(uri2);
        expect(found?.predicate.name).toEqual('pred2');
        expect(cache.findDefinitionByNameArity('pred1', 0)).toBeDefined();
        expect(cache.findDefinitionByNameArity('non_existent', 0)).toBeUndefined();
    });
    
    it('should find references including calling predicate info', () => {
        cache.set(uri1, result1);
        cache.set(uri2, result2);
        
        // Find references TO pred1/0
        const referencesToPred1: ReferenceInfo[] = cache.findReferences('pred1', 0);
        
        // Assertions
        expect(referencesToPred1).toHaveLength(1); // Found one call site
        
        const refInfo = referencesToPred1[0];
        expect(refInfo.uri).toEqual(uri1); // Call is in file1
        
        // Check the 'call' property (the reference itself)
        expect(refInfo.call.name).toEqual('pred1'); // The call *is* to pred1
        expect(refInfo.call.arity).toEqual(0);
        expect(refInfo.call.location).toEqual(callLocationInCaller1); // Check the location of the call
        
        // --- Check the 'callingPredicate' property ---
        expect(refInfo.callingPredicate).toBeDefined();
        expect(refInfo.callingPredicate.name).toEqual('caller1'); // The caller predicate is caller1
        expect(refInfo.callingPredicate.arity).toEqual(1);
        expect(refInfo.callingPredicate.definitionRange).toEqual(defRangeCaller1); // Check range too if needed
        // --- End Assertion ---
        
        // Check references TO pred2/1 (should be empty)
        expect(cache.findReferences('pred2', 1)).toEqual([]);
    });
});
