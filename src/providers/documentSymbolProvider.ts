import { DocumentSymbolParams, DocumentSymbol, SymbolKind } from 'vscode-languageserver/node';
import { ParserResultPredicate } from '../parseResult/types';
import { blintRangeToLspRange } from '../parseResult/rangeUtils';
import AnalysisCache from '../interfaces/analysisCache';

export function provideDocumentSymbols(
    params: DocumentSymbolParams,
    cache: AnalysisCache
): DocumentSymbol[] | null {
    const parseResult = cache.get(params.textDocument.uri);
    if (!parseResult) return null;

    console.log(`DocumentSymbolProvider: Providing symbols for ${params.textDocument.uri}`);

    return parseResult.predicates.map((pred: ParserResultPredicate) => {
        // Use the precise definitionRange from BLint
        const definitionLspRange = blintRangeToLspRange(pred.definitionRange);

        return DocumentSymbol.create(
            `${pred.name}/${pred.arity}`, // Display name
            undefined, // Detail
            SymbolKind.Function, // Or Method/Field as appropriate
            definitionLspRange, // Full range is the definition head range
            definitionLspRange  // Selection range is also the definition head range
            // children: [] // Add children if BLint provides nested symbol info
        );
    });
}
