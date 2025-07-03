# Workflow Orchestration System (Mediator)

A TypeScript-based workflow orchestration system using Kafka and Redis.

## Quick Start

### 1. Infrastructure Setup

Start Kafka and Redis:

```sh
docker compose up
```

Create Kafka topics:

```sh
bun run src/setup-topics.ts
```

### 2. Development Setup

Install dependencies:

```sh
bun install
```

Setup Git hooks (recommended):

```sh
bun run setup-hooks
```

## Documentation

This project uses TypeDoc for API documentation generation.

### Generate Documentation

```sh
bun run docs
```

### Watch Mode (Live Updates)

```sh
bun run docs:watch
```

### Serve Documentation Locally

```sh
bun run docs:serve
# Visit http://localhost:8080
```

## Git Hooks

This project includes a **pre-push Git hook** that automatically:

1. ✅ Checks TypeScript compilation
2. ✅ Runs tests (if available)
3. ✅ Generates TypeDoc documentation
4. ✅ Validates documentation is up-to-date

### How It Works

- **Automatic**: Runs every time you `git push`
- **Prevents bad pushes**: Stops push if any check fails
- **Documentation sync**: Ensures docs are always current
- **Interactive prompts**: Offers to auto-commit updated docs

### Manual Testing

Test the pre-push checks manually:

```sh
bun run pre-push
```

### Emergency Override

Skip hooks in emergencies only:

```sh
git push --no-verify
```

⚠️ **Note**: Only use `--no-verify` in emergencies as it bypasses all quality checks.

## Available Scripts

- `bun run start` - Start the application
- `bun run docs` - Generate TypeDoc documentation
- `bun run docs:watch` - Generate docs with live reload
- `bun run docs:serve` - Serve docs locally on port 8080
- `bun run test` - Run tests
- `bun run check` - TypeScript type checking
- `bun run pre-push` - Run pre-push checks manually
- `bun run setup-hooks` - Setup Git hooks

## Infrastructure Commands

Stop and cleanup:

```sh
docker compose down
```
