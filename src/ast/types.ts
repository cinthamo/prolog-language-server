// --- Basic Location and Range ---

/** Represents a position in the source file (1-based line, 1-based column) */
interface AstPosition {
    line: number;
    column: number;
}

/** Represents a range in the source file */
interface AstRange {
    start: AstPosition;
    end: AstPosition;
}

// --- General AST Node Structure ---

/** Base interface for all AST nodes */
interface AstNodeBase {
    /** The syntactic type of the node */
    type: string; // 'directive', 'rule', 'fact', 'functor', 'atom', 'var', etc.
    /** Line number where the node starts/is defined */
    line: number;
    /** Column number where the node starts/is defined */
    column: number;
    /** Optional: Could include a full AstRange if available for all nodes */
    range?: AstRange;
    /** Raw text representation or source identifier (may vary in structure) */
    raw?: string | string[]; // Can be a single string or array for rules/multi-part terms
}

// --- Specific Term Types ---

interface AstAtom extends AstNodeBase {
    type: 'atom';
    text: string;
    raw: string; // e.g., "5/12-atom(bprocess_ast_json_i)"
}

interface AstVar extends AstNodeBase {
    type: 'var' | 'unnamed_var'; // Distinguish named and unnamed vars
    name: string; // Variable name, including "_" for unnamed
    raw: string;
}

interface AstNumber extends AstNodeBase {
    type: 'number';
    value: number;
    raw: string;
}

interface AstOperator extends AstNodeBase {
    type: 'operator';
    op: string; // The operator symbol (e.g., '/', '-', '=..')
    raw: string;
}

// Represents a Parameter within a Functor's argument list
interface AstParam extends AstNodeBase {
    type: 'param'; // Custom type maybe? Or just use AstTerm directly? Let's assume BLint uses 'param'
    // The actual term node is likely nested. Need to clarify BLint output.
    // For now, assume the value is directly one of the AstTerm types
    // This might need adjustment based on the actual JSON structure within 'params' array elements.
    // If 'param' nodes don't exist, remove this and use AstTerm directly in AstFunctor.params
    value: AstTerm; // The term itself
    raw: string;
}

interface AstFunctor extends AstNodeBase {
    type: 'functor';
    name: string; // Functor name
    arity: number;
    // params: AstParam[]; // Option 1: If BLint wraps params
    params: AstTerm[];    // Option 2: If params array contains terms directly
    raw: string;
}

interface AstInfix extends AstNodeBase {
    type: 'infix';
    op: AstOperator; // The operator details
    left: AstTerm;   // Left operand
    right: AstTerm;  // Right operand
    raw: string;
}

interface AstList extends AstNodeBase {
    type: 'list';
    items: AstTerm[]; // Elements of the list
    // Optional: head/tail representation if BLint provides it for [H|T] syntax
    head?: AstTerm;
    tail?: AstTerm | AstList; // Tail could be another list or variable
    raw: string;
}

interface AstParenthesis extends AstNodeBase {
    type: 'parenthesis'; // Represents code within (...) often goal conjunction/disjunction
    content: AstTerm[]; // Array of terms inside the parentheses
    raw: string | string[];
}

interface AstCut extends AstNodeBase {
    type: 'cut'; // Represents '!'
    raw: string;
}

// Union type for any valid term within the AST
type AstTerm =
    | AstAtom
    | AstVar
    | AstNumber
    | AstOperator // Operators can sometimes appear as terms? Less common.
    | AstFunctor
    | AstInfix
    | AstList
    | AstParenthesis
    | AstCut
    | AstParam; // Include if BLint uses 'param' nodes

// --- Clause/Directive Level Types ---

interface AstComment extends AstNodeBase {
    type: 'line' | 'block'; // Type of comment
    text: string; // Content of the comment
}

interface AstDirective extends AstNodeBase {
    type: 'directive';
    // The body of the directive, usually one or more functors
    directives: AstFunctor[]; // e.g., [functor(dynamic, 1, ...)]
    raw: string[]; // Array representing the directive term(s)
    comments?: AstComment[]; // Optional associated comments
}

interface AstFact extends AstNodeBase {
    type: 'fact';
    head: AstTerm; // The fact's head term (usually AstFunctor or AstAtom)
    raw: string[]; // Array representing the fact term
    comments?: AstComment[];
}

interface AstRule extends AstNodeBase {
    type: 'rule';
    head: AstTerm; // The rule's head term
    body: AstTerm[]; // Array of goal terms in the body
     // Array representing head and body terms
    comments?: AstComment[];
}

interface AstParseError extends AstNodeBase {
    type: 'parseerror';
    kind: string;
}

// Union type for top-level elements in a file
type AstTopLevel = (AstDirective | AstFact | AstRule | AstParseError) & { raw: string[]; comments?: AstComment[] };

// --- Root Structure ---

/** The root object representing the parsed AST of a Prolog file */
interface PrologAst {
    file: string; // Absolute path to the source file
    predicates: AstTopLevel[]; // Array of top-level predicates/directives
    topLevelComments?: AstComment[];
}

// --- Type Guards (Optional but useful) ---
function isAstAtom(node: AstNodeBase): node is AstAtom { return node.type === 'atom'; }
function isAstVar(node: AstNodeBase): node is AstVar { return node.type === 'var' || node.type === 'unnamed_var'; }
function isAstFunctor(node: AstNodeBase): node is AstFunctor { return node.type === 'functor'; }
function isAstInfix(node: AstNodeBase): node is AstInfix { return node.type === 'infix'; }
function isAstList(node: AstNodeBase): node is AstList { return node.type === 'list'; }
function isAstParenthesis(node: AstNodeBase): node is AstParenthesis { return node.type === 'parenthesis'; }
function isAstCut(node: AstNodeBase): node is AstCut { return node.type === 'cut'; }
function isAstParam(node: AstNodeBase): node is AstParam { return node.type === 'param'; }
function isAstComment(node: AstNodeBase): node is AstComment { return node.type === 'comment'; }
function isAstDirective(node: AstNodeBase): node is AstDirective { return node.type === 'directive'; }
function isAstFact(node: AstNodeBase): node is AstFact { return node.type === 'fact'; }
function isAstRule(node: AstNodeBase): node is AstRule { return node.type === 'rule'; }
function isAstParseError(node: AstNodeBase): node is AstParseError { return node.type === 'parseerror'; }
// Add guards for other types as needed

export default PrologAst;
export {
    AstNodeBase, AstTopLevel, AstTerm, AstAtom, AstVar, AstNumber, AstOperator,
    AstFunctor, AstInfix, AstList, AstParenthesis, AstCut, AstParam,
    AstComment, AstDirective, AstFact, AstRule, AstParseError,
    isAstAtom, isAstVar, isAstFunctor, isAstInfix, isAstList, isAstParenthesis,
    isAstCut, isAstParam, isAstComment, isAstDirective, isAstFact, isAstRule, isAstParseError
}
