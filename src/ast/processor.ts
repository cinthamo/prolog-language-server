import PrologAst, { AstNodeBase, AstTerm, isAstFunctor, isAstAtom, isAstInfix, isAstList, isAstParenthesis, isAstRule, isAstFact, isAstDirective, isAstParseError } from './types';
import ParseResult, { ParserResultPredicate, EnhancedCallInfo, SourceRange, DiagnosticData } from '../parseResult/types';

// Helper to extract name/arity from a predicate head term
function getHeadNameArity(head: AstTerm): { name: string; arity: number } | null {
    if (isAstFunctor(head)) {
        return { name: head.name, arity: head.arity };
    } else if (isAstAtom(head)) {
        // Facts can be simple atoms (arity 0)
        return { name: head.text, arity: 0 };
    }
    // Handle other potential head types if necessary (e.g., infix operators used as heads)
    return null;
}

// Helper to extract a SourceRange from potentially incomplete AST node info
// Returns a default range if line/column are missing.
function getSourceRangeFromNode(node: AstNodeBase): SourceRange {
    // --- This requires BLint to provide usable location info ---
    // --- Adapt based on what BLint *actually* provides for terms ---

    // Ideal case: Node has a 'range' property of type AstRange
    // if (node.range) { return node.range; }

    // Fallback: Use line/column if available
    if (node.line && node.column) {
        // Attempt to calculate end based on raw text length (heuristic!)
        const rawText = Array.isArray(node.raw) ? node.raw[0] : node.raw; // Use first raw string if array
        const endChar = node.column -1 + (rawText?.split('-')[1]?.length || 1); // Very rough guess based on atom/var name in raw:"L/C-type(Name)"
        return {
            startLine: node.line,
            startCharacter: node.column - 1, // Assume 1-based column -> 0-based character
            endLine: node.line, // Assume single line for simple terms
            endCharacter: endChar > node.column - 1 ? endChar : node.column // Ensure end >= start
        };
    }

    // Absolute fallback (indicates missing info from BLint)
    console.warn(`AST node missing location info: ${JSON.stringify(node)}`);
    return { startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 1 };
}

// Recursive helper to find all calls (functors) within a term or list of terms
function findCallsInBody(body: AstTerm[], calls: EnhancedCallInfo[]): void {
    for (const term of body) {
        if (!term) continue;

        if (isAstFunctor(term)) {
            // Found a potential call (functor)
            calls.push({
                name: term.name,
                arity: term.arity,
                location: getSourceRangeFromNode(term) // <<< RELIES ON BLINT PROVIDING LOCATION FOR FUNCTORS
                // Optional: Add fullCallLocation if BLint provides range for the whole term
            });
            // Recursively search inside the parameters of the functor
            findCallsInBody(term.params, calls); // Assumes params is AstTerm[]
        } else if (isAstInfix(term)) {
            // Recursively search left and right operands
            findCallsInBody([term.left, term.right], calls);
            // Optionally add the infix operator itself as a "call" if needed
            // calls.push({ name: term.op.op, arity: 2, location: getSourceRangeFromNode(term.op) });
        } else if (isAstList(term)) {
            // Recursively search list items
            findCallsInBody(term.items, calls);
        } else if (isAstParenthesis(term)) {
            // Recursively search content within parentheses
            findCallsInBody(term.content, calls);
        }
        // Ignore AstAtom, AstVar, AstNumber, AstCut etc. for finding *calls*
    }
}


/**
 * Transforms the detailed PrologAst into the summarized ParseResult.
 * Groups clauses by predicate name/arity.
 * @param ast The PrologAst object from the JSON file.
 * @returns A ParseResult object.
 */
export function transformAstToParseResult(ast: PrologAst): ParseResult {
    const predicatesMap = new Map<string, ParserResultPredicate>();
    const diagnostics: DiagnosticData[] = []; // Collect any diagnostics if needed later

    for (const topLevel of ast.predicates) {
        let headTerm: AstTerm | undefined;
        let bodyTerms: AstTerm[] = [];
        let currentComments = topLevel.comments || []; // Comments associated with this clause/directive

        if (isAstRule(topLevel)) {
            headTerm = topLevel.head;
            bodyTerms = topLevel.body;
        } else if (isAstFact(topLevel)) {
            headTerm = topLevel.head;
            // bodyTerms remain empty
        } else if (isAstDirective(topLevel)) {
            // Handle directives if necessary (e.g., track dynamic, multifile)
            // For now, we primarily care about predicate definitions (rules/facts)
            continue; // Skip directives for basic ParseResult
        } else if (isAstParseError(topLevel)) {
            diagnostics.push({
                line: topLevel.line,
                character: topLevel.column,
                message: `${topLevel.kind} error`,
                severity: 'error'
            });
            continue; // Skip parse errors for basic ParseResult
        } else {
            continue; // Skip unknown top-level types
        }

        if (!headTerm) continue;

        const headInfo = getHeadNameArity(headTerm);
        if (!headInfo) {
            console.warn(`Could not determine name/arity for head term: ${JSON.stringify(headTerm)}`);
            continue;
        }

        const predicateKey = `${headInfo.name}/${headInfo.arity}`;
        const definitionRange = getSourceRangeFromNode(headTerm); // <<< RELIES ON BLINT PROVIDING LOCATION FOR HEAD

        // Find calls within the body of this specific clause
        const clauseCalls: EnhancedCallInfo[] = [];
        findCallsInBody(bodyTerms, clauseCalls);

        // Get or create the entry in the map
        let predicateEntry = predicatesMap.get(predicateKey);

        if (!predicateEntry) {
            // First time seeing this predicate/arity
            predicateEntry = {
                name: headInfo.name,
                arity: headInfo.arity,
                startLine: topLevel.line || definitionRange.startLine, // Use top-level line or range start
                endLine: topLevel.line || definitionRange.endLine,     // Use top-level line or range end (initial)
                definitionRange: definitionRange, // Use range of the first head encountered
                calls: clauseCalls,
                // comments: currentComments // Optionally aggregate comments
            };
            predicatesMap.set(predicateKey, predicateEntry);
        } else {
            // Aggregate results for subsequent clauses of the same predicate
            predicateEntry.calls.push(...clauseCalls);
            // Update start/end lines to encompass all clauses
            predicateEntry.startLine = Math.min(predicateEntry.startLine, topLevel.line || definitionRange.startLine);
            predicateEntry.endLine = Math.max(predicateEntry.endLine, topLevel.line || definitionRange.endLine); // Need end line from AST ideally
            // Optionally aggregate comments
            // predicateEntry.comments = [...(predicateEntry.comments || []), ...currentComments];
        }
    }

    // Convert map values to array
    const predicatesArray = Array.from(predicatesMap.values());

    return {
        filePath: ast.file,
        predicates: predicatesArray,
        diagnostics
    };
}
