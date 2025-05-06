import { Connection } from 'vscode-languageserver';
import AnalysisCache from './interfaces/analysisCache';
import DocumentManager from './documentManager';
import ParseResult from './parseResult/types';
import PrefixLogger from './utils/prefixLogger';
import Logger from './interfaces/logger';

export function registerCustomRequests(
    connection: Connection,
    logger: Logger,
    cache: AnalysisCache,
    docManager: DocumentManager // Needed to ensure analysis before returning data
) {
    const xLogger = new PrefixLogger("CustomRequest", logger);
    connection.onRequest('$/prolog/getAnalyzedData', async (params: { textDocument: { uri: string } }): Promise<ParseResult | null> => {
        const uri = params.textDocument.uri;
        xLogger.info(`Received $/prolog/getAnalyzedData for ${uri}`);

        // Option 1: Return directly from cache if available
        let analysis = cache.get(uri);

        // Option 2: Ensure analysis is done (more robust)
        if (!analysis) {
             xLogger.info(`Analysis not cached for ${uri}. Triggering analysis...`);
             // Need a way to trigger and wait for analysis of a specific document
             // This might involve the DocumentManager returning the result or a promise
             analysis = await docManager.analyzeDocument(uri); // Add analyzeDocument method to manager
        }


        if (analysis) {
            xLogger.info(`Returning cached/analyzed data for ${uri}`);
            return analysis;
        } else {
            xLogger.info(`No analysis data available for ${uri}`);
            return null;
        }
    });

    // Register other custom requests here...
}
