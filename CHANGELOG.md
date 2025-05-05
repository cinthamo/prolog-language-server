# Changelog

All notable changes to the "prolog-language-server" project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
### Changed
### Deprecated
### Removed
### Fixed
### Security

## [0.1.0] - 2025-05-05

### Added

*   Initial release of the Prolog Language Server.
*   Integration with external `BLint` tool for parsing and analysis.
*   Bundling of platform-specific `BLint` binaries.
*   Configuration option (`prologLanguageServer.blint.path`) to use a custom `BLint` executable.
*   LSP Provider: Diagnostics (`textDocument/publishDiagnostics`) based on `BLint` output.
*   LSP Provider: Go to Definition (`textDocument/definition`) based on analysis cache.
*   LSP Provider: Find References (`textDocument/references`) based on analysis cache.
*   LSP Provider: Document Symbols (`textDocument/documentSymbol`).
*   Custom LSP Request: `$/prolog/getAnalyzedData` to retrieve detailed `ParseResult`.
*   Dependency Injection pattern implemented for core components (Parser, Cache, Logger, etc.).
*   Unit and Integration tests using Jest.
*   Build process using `esbuild` and TypeScript type checking.
