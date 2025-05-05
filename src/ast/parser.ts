import * as fs from 'node:fs/promises';
import PrologAst from './types'; // Adjust import path

export async function readAndParseAst(filePath: string): Promise<PrologAst | undefined> {
    try {
        const jsonContent = await fs.readFile(filePath, 'utf-8');
        const parsedData = JSON.parse(jsonContent);
        // TODO: Add validation here if needed (e.g., using Zod or io-ts)
        // to ensure the parsed data *actually* matches the PrologAst interface.
        return parsedData as PrologAst;
    } catch (error) {
        console.error(`Failed to read or parse AST JSON from ${filePath}:`, error);
        return undefined;
    }
}
