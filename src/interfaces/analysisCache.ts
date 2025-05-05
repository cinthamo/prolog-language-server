import ParseResult, { ParserResultPredicate, EnhancedCallInfo } from "../parseResult/types";
import { Position } from 'vscode-languageserver';

// --- AnalysisCache types and interface ---
export interface ReferenceInfo {
    /** URI of the file containing the call */
    uri: string;
    /** Information about the specific call site */
    call: EnhancedCallInfo;
    /** Information about the predicate that contains this call */
    callingPredicate: ParserResultPredicate;
}

export type FindElementResult =
    | { type: 'definition', predicate: ParserResultPredicate, uri: string }
    | { type: 'call', call: EnhancedCallInfo, callingPredicate: ParserResultPredicate, uri: string }
    | undefined;

export default interface AnalysisCache {
    set(uri: string, result: ParseResult): void;
    get(uri: string): ParseResult | undefined;
    delete(uri: string): void;
    clear(): void;

    /**
    * Finds the specific predicate definition head or call identifier
    * that contains the given LSP Position within a specific document.
    * @param uri The document URI (string)
    * @param position The LSP Position (0-based)
    * @returns Object with info and type ('definition' or 'call'), or undefined if not found.
    */
    findElementAtPosition(uri: string, position: Position): FindElementResult

    /**
    * Finds all predicates that call the target predicate
    * @param targetName The name of the predicate to find calls for
    * @param targetArity The arity of the predicate to find calls for
    * @returns Array of objects with uri and call info for each call to the target predicate */
    findReferences(targetName: string, targetArity: number): ReferenceInfo[];

    /**
    * Finds the specific predicate definition head or call identifier
    * that contains the given LSP Position within a specific document.
    * @param uri The document URI (string)
    * @param position The LSP Position (0-based)
    * @returns Object with info and type ('definition' or 'call'), or undefined if not found.
    */
    findDefinitionByNameArity(name: string, arity: number): { uri: string, predicate: ParserResultPredicate } | undefined;
}
