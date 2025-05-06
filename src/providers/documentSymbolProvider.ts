import { DocumentSymbolParams, DocumentSymbol, SymbolKind } from 'vscode-languageserver/node';
import { ParserResultPredicate } from '../parseResult/types';
import { blintRangeToLspRange } from '../parseResult/rangeUtils';
import AnalysisCache from '../interfaces/analysisCache';
import Logger from '../interfaces/logger';
import PrefixLogger from '../utils/prefixLogger';

export function provideDocumentSymbols(
    params: DocumentSymbolParams,
    cache: AnalysisCache,
    logger: Logger
): DocumentSymbol[] | null {
    const xLogger = new PrefixLogger(`DocumentSymbolProvider`, logger);
    const parseResult = cache.get(params.textDocument.uri);
    if (!parseResult) return null;

    xLogger.info(`Providing symbols for ${params.textDocument.uri}`);

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
