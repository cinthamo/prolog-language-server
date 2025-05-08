// The target structure holding analysis results for a file
export default interface ParseResult {
    filePath: string; // Absolute path
    predicates: Array<ParserResultPredicate>;
    diagnostics?: DiagnosticData[]; // Keep diagnostics if BLint provides them
}

// Re-use SourceRange from Ast types if defined in the same file, otherwise redefine/import
export interface SourceRange {
    startLine: number;      // 1-based
    startCharacter: number; // 0-based
    endLine: number;        // 1-based
    endCharacter: number;   // 0-based, exclusive
}

// Information about a specific call site
export interface EnhancedCallInfo {
    name: string;
    arity: number;
    location: SourceRange; // Location of the call *identifier*
}

// Information about a defined predicate extracted for the cache
export interface ParserResultPredicate {
    name: string;
    arity: number;
    definitionRange: SourceRange; // Precise range of the *first* head encountered
    fullRange: SourceRange;  // Overall range of all the clauses including comments
    calls: Array<EnhancedCallInfo>; // Calls made within *all* clauses of this predicate
}

// Diagnostic structure (as before)
export interface DiagnosticData {
    line: number; // 1-based
    character: number; // 0-based
    message: string;
    severity: 'error' | 'warning' | 'info' | 'hint';
}
