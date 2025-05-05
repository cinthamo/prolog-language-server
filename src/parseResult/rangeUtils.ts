import { Range } from 'vscode-languageserver-types';
import { SourceRange } from './types';

// Helper to convert BLint range to LSP range (can live here or in utils)
export function blintRangeToLspRange(blintRange: SourceRange): Range {
    // Assumes BLint uses 1-based lines, 0-based characters as defined
    return Range.create(
        blintRange.startLine - 1,     // Convert line to 0-based
        blintRange.startCharacter,
        blintRange.endLine - 1,       // Convert line to 0-based
        blintRange.endCharacter
    );
}
