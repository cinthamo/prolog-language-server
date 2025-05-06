import * as fs from 'node:fs/promises';
import PrologAst from './types'; // Adjust import path
import Logger from '../interfaces/logger';

export async function readAndParseAst(filePath: string, logger: Logger): Promise<PrologAst | undefined> {
    try {
        const jsonContent = await fs.readFile(filePath, 'utf-8');
        const parsedData = JSON.parse(jsonContent);
        // TODO: Add validation here if needed (e.g., using Zod or io-ts)
        // to ensure the parsed data *actually* matches the PrologAst interface.
        return parsedData as PrologAst;
    } catch (error) {
        logger.error(`Failed to read or parse AST JSON from ${filePath}:`, error);
        return undefined;
    }
}
