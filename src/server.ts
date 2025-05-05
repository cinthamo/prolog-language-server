import {
    createConnection, ProposedFeatures, TextDocuments, InitializeParams, TextDocumentSyncKind,
    InitializeResult, TextDocumentPositionParams, Definition, ReferenceParams, Location,
    DocumentSymbolParams, DocumentSymbol, DidChangeConfigurationNotification
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { provideDefinition } from './providers/definitionProvider';
import { provideReferences } from './providers/referencesProvider';
import { provideDocumentSymbols } from './providers/documentSymbolProvider';
import { registerCustomRequests } from './customRequests';
import DocumentManager from './documentManager';
import RealAnalysisCache from './utils/realAnalysisCache';

console.log('Starting Prolog Language Server...');

// Create a connection for the server using Node's IPC as a transport
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Global components
const analysisCache = new RealAnalysisCache();
const documentManager = new DocumentManager(documents, analysisCache, connection);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

connection.onInitialize((params: InitializeParams): InitializeResult => {
    console.log('Server onInitialize');
    const capabilities = params.capabilities;

    hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
    hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);

    // Log client capabilities for debugging
    // console.log("Client Capabilities:", JSON.stringify(capabilities, null, 2));

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            // Standard capabilities
            definitionProvider: true,
            referencesProvider: true,
            documentSymbolProvider: true,
            hoverProvider: false,
            completionProvider: undefined,
            workspace: {
                workspaceFolders: {
                    supported: true
                }
            }
        }
    };
    return result;
});

connection.onInitialized(() => {
    console.log('Server onInitialized');
    if (hasConfigurationCapability) {
        // Register for configuration changes.
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
            connection.console.log('Workspace folder change event received.');
            // Potentially trigger re-analysis or update workspace root logic if needed
        });
    }

    // --- Optionally fetch initial config or trigger initial analysis ---
    // Example: Trigger analysis for all currently open docs after init
    setTimeout(() => { documentManager.reAnalyzeAllOpenDocuments(); }, 100);
    // e.g., find all .ari files and queue them for analysis via documentManager
});

// --- Configuration Change Handler ---
connection.onDidChangeConfiguration(change => {
    console.log('Server onDidChangeConfiguration');
    if (!hasConfigurationCapability) {
        console.log('Received configuration change but client lacks capability.');
        return;
    }

    // The 'change' object might contain all settings, or just the changed ones.
    // We don't need to parse 'change.settings' here if DocumentManager fetches
    // the latest settings whenever it performs analysis.
    // We just need to trigger re-analysis for relevant documents.
    connection.console.log('Configuration changed. Triggering re-analysis of open documents.');

    // Trigger re-analysis of all open documents managed by the server
    documentManager.reAnalyzeAllOpenDocuments();
});

// --- Standard LSP Handlers ---
connection.onDefinition((params: TextDocumentPositionParams): Definition | null => {
    return provideDefinition(params, analysisCache);
});

connection.onReferences(async (params: ReferenceParams): Promise<Location[] | null> => {
    return provideReferences(params, analysisCache);
});

connection.onDocumentSymbol((params: DocumentSymbolParams): DocumentSymbol[] | null => {
    return provideDocumentSymbols(params, analysisCache);
});

// --- Custom LSP Handlers ---
registerCustomRequests(connection, analysisCache, documentManager);

// Make the text document manager listen on the connection
documents.listen(connection);

// Listen on the connection
connection.listen();

console.log('Prolog Language Server setup complete and listening.');
