# Prolog Language Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A language server for the Prolog language, designed to provide Language Server Protocol (LSP) features by analyzing code using the external `BLint` tool.

This server is primarily intended to be bundled and utilized by VS Code extensions, such as `vscode-prolog-debug` and `vscode-code-ladder`, to provide enhanced Prolog development capabilities.

## Features

*   **Parsing & Analysis:** Leverages the external `BLint` tool to parse Prolog files and generate a detailed Abstract Syntax Tree (AST).
*   **Diagnostics:** Reports syntax errors and potentially other issues found by `BLint` via LSP (`textDocument/publishDiagnostics`).
*   **Go to Definition:** Provides definition locations for predicates (`textDocument/definition`).
*   **Find References:** Finds all call sites for a given predicate (`textDocument/references`).
*   **Document Symbols:** Lists predicates defined within a file for outlining (`textDocument/documentSymbol`).
*   **Custom Data Request:** Offers a custom LSP request (`$/prolog/getAnalyzedData`) to retrieve the detailed `ParseResult` (including AST information and call locations) for use by other tools.

## Installation & Usage

This language server is **not intended for direct installation** by end-users. It is designed to be included as a dependency within a VS Code extension.

It will be bundled within the `vscode-prolog-debug` extension. When that extension is installed and activated for a Prolog file, it will automatically start this language server in the background.

Other extensions, like `vscode-code-ladder`, can then connect to the running server (typically via an API exposed by `vscode-prolog-debug`) to utilize its features.

## Configuration

While the server bundles platform-specific versions of `BLint`, users can override this via VS Code settings if they need to use a specific local installation:

*   **`prologLanguageServer.blint.path`**: (string | null)
    *   Set to the absolute path of your custom `BLint` executable.
    *   Set to `null` (default) to use the bundled version appropriate for your OS and architecture.

Settings are typically configured in VS Code's `settings.json` (User or Workspace).

## Development

Instructions for setting up a development environment for the language server itself:

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/cinthamo/prolog-language-server.git
    cd prolog-language-server
    ```
2.  **Install Dependencies:**
    ```bash
    npm install
    ```
3.  **Setup BLint Source:**
    *   Ensure the `BLint` executables you built externally are available.
    *   Create a `.env` file in the project root:
        ```dotenv
        BLINT_SOURCE_DIR="/path/to/your/external/blint/tools/Generated/Tools"
        ```
    *   *(Alternatively, set the `BLINT_SOURCE_DIR` environment variable in your shell.)*
4.  **Build:** This compiles TypeScript, copies BLint binaries to `./bin`, and bundles the server code into `./out`:
    ```bash
    npm run build:full
    ```
5.  **Watch (for development):** Automatically rebuilds on changes.
    ```bash
    npm run watch
    ```
6.  **Run Tests:**
    ```bash
    # Run unit & integration tests (requires BLint to be locatable for integration tests)
    npm test
    ```

## Contributing

Contributions (issues, pull requests) are welcome! Please feel free to open an issue to discuss potential changes or report bugs.

## License

This project is licensed under the **MIT License**. See the [LICENSE.md](LICENSE.md) file for details.
