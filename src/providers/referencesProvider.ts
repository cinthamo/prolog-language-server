import { ReferenceParams, Location } from 'vscode-languageserver/node';
import { blintRangeToLspRange } from '../parseResult/rangeUtils';
import AnalysisCache from '../interfaces/analysisCache';

export async function provideReferences(
    params: ReferenceParams,
    cache: AnalysisCache
): Promise<Location[] | null> {
    
    // 1. Find what element is at the cursor position to get target name/arity
    const elementInfo = cache.findElementAtPosition(params.textDocument.uri, params.position);
    if (!elementInfo) {
        console.log(`ReferencesProvider: No element found at position.`);
        return null;
    }
    
    // Determine the target predicate name/arity, whether from a call or definition
    const targetName = (elementInfo.type === 'definition') ? elementInfo.predicate.name : elementInfo.call.name;
    const targetArity = (elementInfo.type === 'definition') ? elementInfo.predicate.arity : elementInfo.call.arity;
    
    console.log(`ReferencesProvider: Finding refs for ${targetName}/${targetArity}`);
    const locations: Location[] = [];
    
    // 2. Iterate through all cached parse results to find call sites
    const references = cache.findReferences(targetName, targetArity);
    for (const ref of references) {
        locations.push(Location.create(
            ref.uri,
            blintRangeToLspRange(ref.call.location) // Use location from the call info
        ));
    }
    
    // 3. Optionally include the definition location
    if (params.context.includeDeclaration) {
        const definitionInfo = cache.findDefinitionByNameArity(targetName, targetArity);
        if (definitionInfo) {
            locations.push(Location.create(
                definitionInfo.uri,
                blintRangeToLspRange(definitionInfo.predicate.definitionRange)
            ));
        }
    }
    
    console.log(`ReferencesProvider: Returning ${locations.length} locations for ${targetName}/${targetArity}.`);
    return locations;
}
