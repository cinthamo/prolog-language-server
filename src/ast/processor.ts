import PrologAst, { AstNodeBase, AstTerm, isAstFunctor, isAstAtom, isAstInfix, isAstList, isAstNumber, isAstParenthesis, isAstRule, isAstFact, isAstDirective, isAstParseError, AstRange, isAstCut, isAstVar, isAstOperator } from './types';
import ParseResult, { ParserResultPredicate, EnhancedCallInfo, SourceRange, DiagnosticData } from '../parseResult/types';
import Logger from '../interfaces/logger';

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

function getNodeText(node: AstNodeBase): string {
    if (isAstAtom(node)) {
        return node.text;
    } else if (isAstVar(node)) {
        return node.name;
    } else if (isAstNumber(node)) {
        return node.value.toString();
    } else if (isAstOperator(node)) {
        return node.op;
    } else if (isAstFunctor(node)) {
        return node.name;
    } else if (isAstInfix(node)) {
        return node.op.op;
    } else if (isAstList(node)) {
        return '[]';
    } else if (isAstParenthesis(node)) {
        return '()';
    } else if (isAstCut(node)) {
        return '!';
    }
    return '???';
}

// Helper to extract a SourceRange from potentially incomplete AST node info
// Returns a default range if line/column are missing.
function getSourceRangeFromNode(node: AstNodeBase, logger: Logger): SourceRange {
    if (node.line && node.column) {
        return {
            startLine: node.line,
            startCharacter: node.column - 1, // Assume 1-based column -> 0-based character
            endLine: node.line, // Assume single line for simple terms
            endCharacter: node.column - 1 + getNodeText(node).length // End character is start + length of text
        };
    }

    // Absolute fallback (indicates missing info from BLint)
    logger.warn(`AST node missing location info: ${JSON.stringify(node)}`);
    return { startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 1 };
}

function getSourceRangeFromAstRange(range: AstRange) {
    return {
        startLine: range.start.line,
        startCharacter: range.start.column - 1,
        endLine: range.end.line,
        endCharacter: range.end.column - 1
    };
}

// Recursive helper to find all calls (functors) within a term or list of terms
function findCallsInBody(body: AstTerm[], calls: EnhancedCallInfo[], logger: Logger): void {
    for (const term of body) {
        if (!term) continue;

        if (isAstFunctor(term)) {
            // Found a potential call (functor)
            calls.push({
                name: term.name,
                arity: term.arity,
                location: getSourceRangeFromNode(term, logger)
            });
            // Recursively search inside the parameters of the functor
            findCallsInBody(term.params, calls, logger); // Assumes params is AstTerm[]
        } else if (isAstInfix(term)) {
            // Recursively search left and right operands
            findCallsInBody([term.left, term.right], calls, logger);
            // Optionally add the infix operator itself as a "call" if needed
            // calls.push({ name: term.op.op, arity: 2, location: getSourceRangeFromNode(term.op) });
        } else if (isAstList(term)) {
            // Recursively search list items
            findCallsInBody(term.items, calls, logger);
        } else if (isAstParenthesis(term)) {
            // Recursively search content within parentheses
            findCallsInBody(term.content, calls, logger);
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
export function transformAstToParseResult(ast: PrologAst, logger: Logger): ParseResult {
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
            logger.warn(`Could not determine name/arity for head term: ${JSON.stringify(headTerm)}`);
            continue;
        }

        const predicateKey = `${headInfo.name}/${headInfo.arity}`;
        const definitionRange = getSourceRangeFromNode(headTerm, logger);

        // Find calls within the body of this specific clause
        const clauseCalls: EnhancedCallInfo[] = [];
        findCallsInBody(bodyTerms, clauseCalls, logger);

        // Get or create the entry in the map
        let predicateEntry = predicatesMap.get(predicateKey);

        if (!predicateEntry) {
            // First time seeing this predicate/arity
            predicateEntry = {
                name: headInfo.name,
                arity: headInfo.arity,
                fullRange: getSourceRangeFromAstRange(topLevel.fullRange),
                definitionRange, // Use range of the first head encountered
                calls: clauseCalls,
                // comments: currentComments // Optionally aggregate comments
            };
            predicatesMap.set(predicateKey, predicateEntry);
        } else {
            // Aggregate results for subsequent clauses of the same predicate
            predicateEntry.calls.push(...clauseCalls);
            // Update start/end lines to encompass all clauses
            predicateEntry.fullRange.startLine = Math.min(predicateEntry.fullRange.startLine, topLevel.line || definitionRange.startLine);
            predicateEntry.fullRange.endLine = Math.max(predicateEntry.fullRange.endLine, topLevel.line || definitionRange.endLine); // Need end line from AST ideally
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
