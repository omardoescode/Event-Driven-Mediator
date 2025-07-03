# Linting Setup

This project uses ESLint and Prettier for code quality and formatting.

## Tools Configured

- **ESLint**: Code linting with TypeScript support
- **Prettier**: Code formatting
- **TypeScript**: Type checking

## Available Scripts

### Development Scripts (Lenient)

- `bun run lint` - Run ESLint with warnings allowed
- `bun run lint:fix` - Auto-fix ESLint issues
- `bun run format` - Format code with Prettier
- `bun run fix:all` - Format + auto-fix linting issues

### CI/Quality Scripts (Strict)

- `bun run lint:check` - Strict linting (no warnings allowed)
- `bun run format:check` - Check if code is formatted
- `bun run check` - TypeScript type checking
- `bun run quality` - Run all quality checks (type + lint + format)

### Combined Scripts

- `bun run lint:all` - Check formatting + run linting
- `bun run test` - Run test suite

## Configuration Files

- `eslint.config.js` - ESLint configuration (modern flat config)
- `.prettierrc.json` - Prettier formatting rules
- `.prettierignore` - Files to exclude from formatting

## ESLint Rules

The configuration is development-friendly:

- Console statements are allowed (useful for Node.js development)
- Unused variables are warnings, not errors
- TypeScript `any` usage shows warnings
- Test files have relaxed rules

For strict CI checks, use `bun run quality` which treats warnings as errors.

## Current Status

The codebase has:

- ✅ 0 TypeScript errors
- ✅ 0 ESLint errors
- ⚠️ 29 ESLint warnings (mostly unused variables)

To clean up warnings, prefix unused variables with underscore: `_unusedVar`
