import { Connection } from 'vscode-languageserver';
import AnalysisCache from './interfaces/analysisCache';
import DocumentManager from './documentManager';
import ParseResult from './parseResult/types';

export function registerCustomRequests(
    connection: Connection,
    cache: AnalysisCache,
    docManager: DocumentManager // Needed to ensure analysis before returning data
) {
    connection.onRequest('$/prolog/getAnalyzedData', async (params: { textDocument: { uri: string } }): Promise<ParseResult | null> => {
        const uri = params.textDocument.uri;
        console.log(`CustomRequest: Received $/prolog/getAnalyzedData for ${uri}`);

        // Option 1: Return directly from cache if available
        let analysis = cache.get(uri);

        // Option 2: Ensure analysis is done (more robust)
        if (!analysis) {
             console.log(`CustomRequest: Analysis not cached for ${uri}. Triggering analysis...`);
             // Need a way to trigger and wait for analysis of a specific document
             // This might involve the DocumentManager returning the result or a promise
             analysis = await docManager.analyzeDocument(uri); // Add analyzeDocument method to manager
        }


        if (analysis) {
            console.log(`CustomRequest: Returning cached/analyzed data for ${uri}`);
            return analysis;
        } else {
            console.log(`CustomRequest: No analysis data available for ${uri}`);
            return null;
        }
    });

    // Register other custom requests here...
}
