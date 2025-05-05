import { TextDocuments, Diagnostic, Connection, Range, DiagnosticSeverity } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseProlog, convertToLspDiagnostics, ParserDependencies } from './parseResult/prologParser';
import { defaultSettings, PrologServerSettings } from './types';
import ParseResult from './parseResult/types';
import Debouncer from './utils/debouncer';
import AnalysisCache from './interfaces/analysisCache';
import realFileSystem from './utils/realFileSystem';
import RealCommandRunner from './utils/realCommandRunner';
import realTempManager from './utils/realTempManager';
import realBlintLocator from './utils/realBlintLocator';
import LspLogger from './utils/lspLogger';
import Logger from './interfaces/logger';

export default class DocumentManager {
    private analysisQueue = new Map<string, Promise<ParseResult | undefined>>(); // Track ongoing analysis
    private debounce = new Debouncer(500); // Debounce analysis on change (500ms)
    private parserDeps: ParserDependencies;

    constructor(
        private documents: TextDocuments<TextDocument>,
        private cache: AnalysisCache,
        private connection: Connection // To send diagnostics and get configuration
    ) {
        this.parserDeps = {
            fs: realFileSystem,
            commandRunnerFactory: (executablePath: string, logger: Logger) => new RealCommandRunner(executablePath, logger),
            tempManager: realTempManager,
            blintLocator: realBlintLocator,
            logger: new LspLogger(this.connection),
        };

        this.documents.onDidOpen(event => {
            console.log(`DocumentManager: Opened ${event.document.uri}`);
            this.triggerAnalysis(event.document);
        });

        // Clear cache entry when document is closed
        this.documents.onDidClose(event => {
            console.log(`DocumentManager: Closed ${event.document.uri}`);
            this.cache.delete(event.document.uri);
            this.connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] }); // Clear diagnostics
        });

        // Analyze document on save
        this.documents.onDidSave(event => {
             console.log(`DocumentManager: Saved ${event.document.uri}`);
             // Don't debounce on save, analyze immediately
             this.triggerAnalysis(event.document);
         });


        // Debounce analysis for content changes
        this.documents.onDidChangeContent(change => {
            console.log(`DocumentManager: Changed ${change.document.uri}`);
            this.debounce.debounce(change.document.uri, () => {
                 this.triggerAnalysis(change.document);
             });
        });
    }

    /** Fetches the effective PrologServerSettings for the given document scope */
    private async fetchSettings(scopeUri: string): Promise<PrologServerSettings> {
        try {
            const settings = await this.connection.workspace.getConfiguration({
                 scopeUri: scopeUri,
                 section: 'prologLanguageServer' // The top-level section
             });
             // Merge fetched settings with defaults to ensure all fields are present
             // Be careful with nested objects like 'blint'
            const effectiveSettings = { ...defaultSettings, ...settings };
            effectiveSettings.blint = { ...defaultSettings.blint, ...settings?.blint };

            return effectiveSettings;

        } catch (e) {
             console.error(`Error fetching configuration for ${scopeUri}:`, e);
             this.connection.console.error(`Error fetching configuration: ${e}`);
             return defaultSettings; // Fallback to defaults on error
        }
    }

    /** Triggers analysis, managing the queue */
    private triggerAnalysis(document: TextDocument): void {
        const uri = document.uri;
        // If already analyzing this URI, don't queue again immediately
        // The latest trigger (via debounce) will eventually run.
        if (this.analysisQueue.has(uri)) {
             console.log(`DocumentManager: Analysis already queued/running for ${uri}`);
             return;
        }

        console.log(`DocumentManager: Queuing analysis for ${uri}`);
        const analysisPromise = this.performAnalysis(document);
        this.analysisQueue.set(uri, analysisPromise);

        // Once analysis finishes (successfully or not), remove from queue
        analysisPromise.finally(() => {
            this.analysisQueue.delete(uri);
        });
    }

    /** Performs the actual parsing and updates cache/diagnostics */
    private async performAnalysis(document: TextDocument): Promise<ParseResult | undefined> {
        const uri = document.uri;
        try {
            console.log(`DocumentManager: Fetching settings and starting analysis for ${uri}...`);
            const currentSettings = await this.fetchSettings(uri);
    
            // --- Call parser which now always returns ParseResult ---
            const result = await parseProlog(uri, document.getText(), currentSettings, this.parserDeps);
    
            // Process the result (even if it only contains diagnostics)
            this.cache.set(uri, result); // Cache the result regardless
            const diagnostics = convertToLspDiagnostics(result.diagnostics);
            this.connection.sendDiagnostics({ uri, diagnostics });
            console.log(`DocumentManager: Analysis complete for ${uri}. Found ${result.predicates.length} predicates. Sent ${diagnostics.length} diagnostics.`);
    
            return result; // Return the result
    
        } catch (error) {
            // This catch block now primarily handles *unexpected* errors *within* performAnalysis itself,
            // as parseProlog is designed to handle BLint errors internally and return diagnostics.
            console.error(`DocumentManager: Internal analysis error for ${uri}:`, error);
            this.cache.delete(uri); // Clear cache on internal error
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.connection.sendDiagnostics({ uri, diagnostics: [
                Diagnostic.create(Range.create(0,0,0,0), `Internal analysis error: ${errorMsg}`, DiagnosticSeverity.Error, undefined, 'Prolog LSP')
            ]});
            return undefined; // Indicate failure due to internal error
        }
    }
    
    public async analyzeDocument(uri: string): Promise<ParseResult | undefined> {
        let analysis = this.cache.get(uri);
        if (analysis) {
            return analysis;
        }
        if (this.analysisQueue.has(uri)) {
            return this.analysisQueue.get(uri);
        }
        const document = this.documents.get(uri);
        if (document) {
            const analysisPromise = this.performAnalysis(document);
            this.analysisQueue.set(uri, analysisPromise);
            analysisPromise.finally(() => this.analysisQueue.delete(uri));
            return analysisPromise;
        } else {
            console.warn(`analyzeDocument: Document not managed: ${uri}`);
            return undefined;
        }
    }

    /** Re-analyzes all currently open Prolog documents */
    public async reAnalyzeAllOpenDocuments(): Promise<void> {
        console.log("DocumentManager: Re-analyzing all open Prolog documents due to settings change...");
        const allDocs = this.documents.all(); // Get all documents managed by TextDocuments
        for (const doc of allDocs) {
             // Check if it's a Prolog file based on your logic (e.g., language ID if available later)
             // For now, just re-trigger for all open docs managed by the server
            this.debounce.clear(doc.uri); // Clear any pending debounce for this file
            this.triggerAnalysis(doc); // Trigger analysis immediately
        }
    }
}
