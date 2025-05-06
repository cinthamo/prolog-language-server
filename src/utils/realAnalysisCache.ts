import AnalysisCache, { FindElementResult, ReferenceInfo } from '../interfaces/analysisCache';
import Logger from '../interfaces/logger';
import { blintRangeToLspRange } from '../parseResult/rangeUtils';
import ParseResult, { ParserResultPredicate } from '../parseResult/types';
import { Position, Range } from 'vscode-languageserver/node';
import PrefixLogger from './prefixLogger';

// Helper to check if an LSP Position is within an LSP Range
function isPositionInRange(position: Position, range: Range): boolean {
    // Line check first (more common to be outside)
    if (position.line < range.start.line || position.line > range.end.line) {
        return false;
    }
    // If on start line, check character >= startCharacter
    if (position.line === range.start.line && position.character < range.start.character) {
        return false;
    }
    // If on end line, check character <= endCharacter (Range end is exclusive)
    if (position.line === range.end.line && position.character >= range.end.character) {
        // Allow position *at* the end character for clicking just after
        // return false; // Stricter check
        return true; // Allow being on the end character index
    }
    // Within the lines and character bounds
    return true;
}


// Simple cache, key is file URI (string)
export default class RealAnalysisCache implements AnalysisCache {
    private cache = new Map<string, ParseResult>();
    // Optional: Store derived lookup structures if needed for performance
    // private predicateDefinitions = new Map<string, {uri: string, predicate: ParserResultPredicate}>(); // "name/arity" -> definition info
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = new PrefixLogger(`AnalysisCache`, logger);
    }
    
    public set(uri: string, result: ParseResult): void {
        this.cache.set(uri, result);
        // Update derived structures if used
        // this.updatePredicateDefinitions(uri, result);
        this.logger.info(`Updated entry for ${uri}`);
    }
    
    public get(uri: string): ParseResult | undefined {
        return this.cache.get(uri);
    }
    
    public delete(uri: string): void {
        if (this.cache.delete(uri)) {
            // Update derived structures if used
            // this.removePredicateDefinitions(uri);
            this.logger.info(`Deleted entry for ${uri}`);
        }
    }
    
    public clear(): void {
        this.cache.clear();
        // Clear derived structures if used
        // this.predicateDefinitions.clear();
        this.logger.info(`Cleared all entries.`);
    }
    
    // --- Lookup Methods (Derived from Cache Data) ---
    
    /** Finds the definition info for a predicate by name/arity across all cached files */
    public findDefinitionByNameArity(name: string, arity: number): { uri: string, predicate: ParserResultPredicate } | undefined {
        // This lookup remains useful if we know name/arity from elsewhere
        for (const [uri, parseResult] of this.cache.entries()) {
            const foundPredicate = parseResult.predicates.find(p => p.name === name && p.arity === arity);
            if (foundPredicate) {
                return { uri, predicate: foundPredicate };
            }
        }
        return undefined;
    }
    
    /** Finds all predicates that call the target predicate */
    public findReferences(targetName: string, targetArity: number): ReferenceInfo[] {
        const results: ReferenceInfo[] = [];
        for (const [uri, parseResult] of this.cache.entries()) { // Iterate internal map
            for (const predicate of parseResult.predicates) {
                for (const call of predicate.calls) {
                    if (call.name === targetName && call.arity === targetArity) {
                        results.push({ uri, call, callingPredicate: predicate });
                    }
                }
            }
        }
        return results;
    }

    /**
    * Finds the specific predicate definition head or call identifier
    * that contains the given LSP Position within a specific document.
    */
    public findElementAtPosition(uri: string, position: Position): FindElementResult
    {
        const parseResult = this.get(uri);
        if (!parseResult) return undefined;
        
        for (const predicate of parseResult.predicates) {
            // 1. Check if position is within the definition head's range
            const definitionLspRange = blintRangeToLspRange(predicate.definitionRange);
            if (isPositionInRange(position, definitionLspRange)) {
                return { type: 'definition', predicate: predicate, uri: uri };
            }
            
            // 2. Check if position is within any call's identifier range within this predicate
            for (const call of predicate.calls) {
                const callLspRange = blintRangeToLspRange(call.location);
                if (isPositionInRange(position, callLspRange)) {
                    return { type: 'call', call: call, callingPredicate: predicate, uri: uri };
                }
            }
        }
        
        return undefined; // Position is not within any known definition or call identifier range
    }
}
