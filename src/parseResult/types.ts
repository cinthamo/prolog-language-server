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
    // Optional: Add full call location if needed by consumers
    // fullCallLocation?: SourceRange;
}

// Information about a defined predicate extracted for the cache
export interface ParserResultPredicate {
    name: string;
    arity: number;
    startLine: number; // Overall start line of clauses for this predicate
    endLine: number;   // Overall end line of clauses for this predicate
    definitionRange: SourceRange; // Precise range of the *first* head encountered
    calls: Array<EnhancedCallInfo>; // Calls made within *all* clauses of this predicate
    // Optional: Add comments associated with the definition?
    // comments?: AstComment[]; // Assuming AstComment type exists
}

// Diagnostic structure (as before)
export interface DiagnosticData {
    line: number; // 1-based
    character: number; // 0-based
    message: string;
    severity: 'error' | 'warning' | 'info' | 'hint';
}
