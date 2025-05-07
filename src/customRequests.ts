import { Connection } from 'vscode-languageserver';
import DocumentManager from './documentManager';
import PrefixLogger from './utils/prefixLogger';
import Logger from './interfaces/logger';
import PrologAst from './ast/types';

export function registerCustomRequests(
    connection: Connection,
    logger: Logger,
    docManager: DocumentManager
) {
    const xLogger = new PrefixLogger("CustomRequest", logger);
    connection.onRequest('$/prolog/getFileAst', async (params: { textDocument: { uri: string } }): Promise<PrologAst | null> => {
        const uri = params.textDocument.uri;
        xLogger.info(`Received $/prolog/getFileAst for ${uri}`);

        const ast = await docManager.getFileAst(uri);
        if (ast) {
            xLogger.info(`Returning AST for ${uri}`);
            removeRaw(ast); // raw is for debugging not needed in client
            return ast;
        } else {
            xLogger.info(`No AST data available for ${uri}`);
            return null;
        }
    });

    // Register other custom requests here...
}

function removeRaw(ast: any) {
    if (ast.raw) {
        delete ast.raw;
    }
    if (Array.isArray(ast)) {
        for (const child of ast) {
            removeRaw(child);
        }
    } else if (typeof ast === 'object') {
        for (const child of Object.values(ast)) {
            removeRaw(child);
        }
    }
}
