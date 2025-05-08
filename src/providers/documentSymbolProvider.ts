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
        const fullLspRange = blintRangeToLspRange(pred.fullRange);
        const definitionLspRange = blintRangeToLspRange(pred.definitionRange);

        return DocumentSymbol.create(
            `${pred.name}/${pred.arity}`,
            undefined,
            SymbolKind.Function,
            fullLspRange,
            definitionLspRange
        );
    });
}
