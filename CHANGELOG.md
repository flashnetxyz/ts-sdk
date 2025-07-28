# Changelog

## [0.2.0] - 2024-01-XX

### Added

- **Modular exports** - SDK can now be imported in parts for better tree-shaking
  - `@flashnet/sdk/auth` - Authentication utilities only
  - `@flashnet/sdk/api` - API client without wallet dependencies
  - `@flashnet/sdk/utils` - Utility functions standalone
  - `@flashnet/sdk/types` - TypeScript types only
  - `@flashnet/sdk/config` - Network configurations
  - `@flashnet/sdk/client` - Full client (requires wallet)
- Documentation for modular usage patterns in `docs/modular-usage.md`
- Support for custom signers in backend environments

### Changed

- **BREAKING**: `@buildonspark/spark-sdk` and `@buildonspark/issuer-sdk` are now optional peer dependencies
  - Only required when using `FlashnetClient` or wallet features
  - Backend services can use the SDK without these dependencies
- Moved `Network` enum to local types to avoid spark-sdk dependency
- Improved tree-shaking capabilities

### Migration Guide

If you're using the full `FlashnetClient`:

```bash
# Install peer dependencies explicitly (Bun recommended)
bun add @flashnet/sdk @buildonspark/spark-sdk @buildonspark/issuer-sdk
# or with npm: npm install @flashnet/sdk @buildonspark/spark-sdk @buildonspark/issuer-sdk
```

For backend usage without wallet:

```typescript
// Before
import { AuthManager } from "@flashnet/sdk";

// After - use modular import
import { AuthManager } from "@flashnet/sdk/auth";
```

## [0.1.2] - Previous version

- Initial release with full wallet integration
