import { PrologServerSettings } from "../types";

// Interface for locating the BLint executable
export default interface BlintLocator {
    getBlintPath(settings: PrologServerSettings): Promise<string | null>;
}
