# Third-party notices

## TwitCanva

- Source: https://github.com/SankaiAI/TwitCanva-Video-Workflow
- Copyright 2025 SankaiAI
- License: Apache License 2.0

This project uses TwitCanva as its initial interface baseline and retains selected React/Vite canvas concepts. The active application has been substantially rewritten as a local Codex workbench.

The current pluggable video connectors, provider-neutral job queue, credential handling, and local MCP service are new implementations maintained in this repository; they are not the upstream backend and do not distribute any upstream or maintainer video endpoint, workflow, account, or credential. The original TwitCanva LICENSE and NOTICE, including the upstream commercial-use notification, are retained verbatim in plugins/image-control/app/ and are also included in binary release archives.

## OpenAI Apps SDK examples

- Source: https://github.com/openai/openai-apps-sdk-examples
- Used as an API-shape reference for MCP app resources and app-callable tools.

No source file from the example repository is distributed verbatim as an application component.

## Packaged dependencies

Each formal release includes SBOM.cdx.json (CycloneDX) and THIRD_PARTY_COMPONENTS.json, generated deterministically from the locked app and server dependency trees. These machine-generated inventories complement this notice and the license files bundled with the runtime dependencies.
