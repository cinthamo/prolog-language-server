import { TextDocumentPositionParams, Definition, Location } from 'vscode-languageserver/node';
import { blintRangeToLspRange } from '../parseResult/rangeUtils';
import AnalysisCache from '../interfaces/analysisCache';
import Logger from '../interfaces/logger';
import PrefixLogger from '../utils/prefixLogger';

export function provideDefinition(
    params: TextDocumentPositionParams,
    cache: AnalysisCache, // Now uses cache directly
    logger: Logger
): Definition | null {
    const xLogger = new PrefixLogger(`DefinitionProvider`, logger);

    // 1. Find what element (definition or call) is at the cursor position
    const elementInfo = cache.findElementAtPosition(params.textDocument.uri, params.position);

    if (!elementInfo) {
         xLogger.info(`No element found at position.`);
         return null;
    }

    let targetName: string;
    let targetArity: number;

    if (elementInfo.type === 'definition') {
        // Already on the definition, return its own location
        xLogger.info(`Cursor is on definition ${elementInfo.predicate.name}/${elementInfo.predicate.arity}.`);
        return Location.create(
            elementInfo.uri,
            blintRangeToLspRange(elementInfo.predicate.definitionRange)
        );
    } else { // elementInfo.type === 'call'
         // Find the definition corresponding to the *call*
        targetName = elementInfo.call.name;
        targetArity = elementInfo.call.arity;
        xLogger.info(`Cursor is on call to ${targetName}/${targetArity}. Looking up definition...`);
    }

    // 2. Find the definition location using the cache's name/arity lookup
    const definitionInfo = cache.findDefinitionByNameArity(targetName, targetArity);

    if (definitionInfo) {
        xLogger.info(`Found definition at ${definitionInfo.uri}:${definitionInfo.predicate.definitionRange.startLine}`);
        return Location.create(
            definitionInfo.uri,
            blintRangeToLspRange(definitionInfo.predicate.definitionRange) // Use precise range from definition
        );
    }

    xLogger.info(`Definition not found in cache for ${targetName}/${targetArity}`);
    return null;
}
