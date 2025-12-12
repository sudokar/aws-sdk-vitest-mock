# 🤝 Contributing to AWS SDK Vitest Mock

First off, thank you for considering contributing to AWS SDK Vitest Mock! 🎉

It's people like you that make this library a great tool for the community. We welcome contributions from everyone, whether it's a bug report, feature request, documentation improvement, or code contribution.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Your First Code Contribution](#your-first-code-contribution)
  - [Pull Requests](#pull-requests)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Release Process](#release-process)

## 📜 Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

### Our Standards

- ✅ Be respectful and inclusive
- ✅ Welcome newcomers and help them learn
- ✅ Focus on what is best for the community
- ✅ Show empathy towards other community members
- ❌ No harassment, trolling, or discriminatory language
- ❌ No personal attacks or insults

## 🎯 How Can I Contribute?

### Reporting Bugs 🐛

Before creating bug reports, please check the [issue tracker](https://github.com/sudokar/aws-sdk-vitest-mock/issues) to avoid duplicates.

When you create a bug report, please include:

- **Clear title** - Use a descriptive title
- **Description** - Detailed description of the issue
- **Steps to reproduce** - Step-by-step instructions
- **Expected behavior** - What you expected to happen
- **Actual behavior** - What actually happened
- **Environment** - OS, Node.js version, package version
- **Code sample** - Minimal reproducible example

**Example:**

```markdown
### Bug: Mock not working with DynamoDB BatchGetItem

**Description:**
When mocking `BatchGetItemCommand`, the mock doesn't match the command.

**Steps to Reproduce:**

1. Create a mock: `mockClient(DynamoDBClient)`
2. Configure: `.on(BatchGetItemCommand).resolves({...})`
3. Send command: `client.send(new BatchGetItemCommand({...}))`

**Expected:** Mock should return configured response
**Actual:** Error "No mock configured for command"

**Environment:**

- OS: macOS 14.0
- Node.js: v20.10.0
- aws-sdk-vitest-mock: 0.0.1

**Code Sample:**
\`\`\`typescript
// Your minimal reproducible code here
\`\`\`
```

### Suggesting Enhancements 💡

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear title** - Describe the enhancement
- **Provide detailed description** - Explain why this would be useful
- **Include examples** - Show how it would work
- **Consider alternatives** - Mention other approaches you've considered

**Example:**

```markdown
### Feature Request: Support for AWS SDK v2

**Description:**
Add support for mocking AWS SDK v2 clients alongside v3.

**Use Case:**
Many projects are still migrating from v2 to v3 and need to test both.

**Proposed API:**
\`\`\`typescript
mockClientV2(AWS.S3).on('getObject').resolves({...})
\`\`\`

**Alternatives Considered:**

- Separate package for v2 support
- Migration guide only
```

### Your First Code Contribution 🚀

Unsure where to begin? Look for issues labeled:

- `good first issue` - Simple issues perfect for beginners
- `help wanted` - Issues where we need community help
- `documentation` - Documentation improvements

**Steps:**

1. Comment on the issue you want to work on
2. Wait for maintainer approval/assignment
3. Fork the repository
4. Create your feature branch
5. Make your changes
6. Submit a pull request

### Pull Requests 📬

1. **Fork & Clone**

   ```bash
   git clone https://github.com/YOUR-USERNAME/aws-sdk-vitest-mock.git
   cd aws-sdk-vitest-mock
   ```

2. **Create Branch**

   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

3. **Make Changes**
   - Write your code
   - Add/update tests
   - Update documentation

4. **Test Your Changes**

   ```bash
   bun nx test
   bun nx lint
   bun nx build
   ```

5. **Commit**

   ```bash
   git add .
   git commit -m "feat: add amazing feature"
   ```

6. **Push**

   ```bash
   git push origin feat/your-feature-name
   ```

7. **Open Pull Request**
   - Go to GitHub and create a PR
   - Fill in the PR template
   - Link related issues

## 🛠️ Development Setup

### Prerequisites

- **Node.js** >= 18.0.0
- **Bun** >= 1.0.0 ([Install Bun](https://bun.sh))
- **Git**

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/aws-sdk-vitest-mock.git
cd aws-sdk-vitest-mock

# Install dependencies with Bun
bun install

# Run tests to verify setup
bun nx test
```

### Project Structure

```
aws-sdk-vitest-mock/
├── src/
│   ├── lib/
│   │   ├── mock-client.ts       # Core mocking implementation
│   │   ├── matchers.ts          # Custom Vitest matchers
│   │   ├── vitest-setup.ts      # Matcher registration
│   │   ├── mock-client.test.ts  # Core tests
│   │   ├── matchers.test.ts     # Matcher tests
│   │   └── mixed-versions.test.ts # Compatibility tests
│   └── index.ts                 # Public API exports
├── dist/                        # Build output (generated)
├── eslint.config.mjs           # ESLint configuration
├── tsconfig.json               # TypeScript base config
├── tsconfig.lib.json           # Library build config
├── tsconfig.spec.json          # Test config
├── vite.config.mts             # Vite/Vitest configuration
├── package.json                # Package metadata
└── README.md                   # Main documentation
```

## 🔄 Development Workflow

### Running Tests

```bash
# Run all tests
bun nx test

# Run tests in watch mode
bun nx test --watch

# Run tests with coverage
bun nx test --coverage

# Run specific test file
bun nx test --testFile=src/lib/mock-client.test.ts
```

### Linting

```bash
# Run ESLint
bun nx lint

# Fix auto-fixable issues
bun nx lint --fix
```

### Building

```bash
# Build the library
bun nx build

# Build and watch for changes
bun nx build --watch
```

### Type Checking

```bash
# Run TypeScript compiler check
bun tsc --noEmit
```

### Git Hooks 🪝

This project uses [Husky](https://typicode.github.io/husky/) and [lint-staged](https://github.com/okonet/lint-staged) to ensure code quality before commits.

**Pre-commit Hook:**

- Runs ESLint with auto-fix on staged TypeScript files
- Formats staged files with Prettier
- Automatically runs when you commit

**Commit Message Hook:**

- Validates commit messages follow Conventional Commits format
- Rejects commits with invalid message format

**To bypass hooks (not recommended):**

```bash
git commit --no-verify -m "your message"
```

**Hook Configuration:**

- `.husky/pre-commit` - Pre-commit hook script
- `.husky/commit-msg` - Commit message validation
- `.lintstagedrc.json` - Lint-staged configuration

## 📏 Coding Standards

### TypeScript Guidelines

- ✅ **Use strict TypeScript** - No `any` types allowed
- ✅ **Explicit return types** - For public functions
- ✅ **Prefer `unknown`** over `any` when type is truly unknown
- ✅ **Use type assertions carefully** - Prefer type guards
- ✅ **Document complex types** - Add JSDoc comments

**Example:**

```typescript
// ✅ Good
function processCommand<TInput extends object>(
  input: TInput,
): Promise<CommandOutput> {
  // Implementation
}

// ❌ Bad
function processCommand(input: any): any {
  // Implementation
}
```

### Code Style

- **Indentation:** 2 spaces
- **Quotes:** Single quotes for strings
- **Semicolons:** Required
- **Line length:** Max 120 characters
- **Naming:**
  - `camelCase` for variables and functions
  - `PascalCase` for types and classes
  - `UPPER_CASE` for constants

### ESLint Rules

We follow `@typescript-eslint/recommended-type-checked` with custom rules:

- No `any` types
- Explicit function return types
- No unused variables
- Consistent import order
- Security best practices

### File Organization

```typescript
// 1. Imports (external, then internal)
import { vi } from 'vitest';
import type { MetadataBearer } from '@smithy/types';

// 2. Type definitions
export interface MockOptions {
  strict?: boolean;
}

// 3. Constants
const DEFAULT_OPTIONS: MockOptions = { strict: false };

// 4. Helper functions
function isCommand(obj: unknown): boolean {
  // Implementation
}

// 5. Main exports
export function mockClient<TClient>(...) {
  // Implementation
}
```

## 🧪 Testing Guidelines

### Test Structure

```typescript
import { describe, test, expect, beforeEach, afterEach } from "vitest";

describe("Feature Name", () => {
  let mock: AwsClientStub<S3Client>;

  beforeEach(() => {
    mock = mockClient(S3Client);
  });

  afterEach(() => {
    mock.restore();
  });

  test("should do something specific", async () => {
    // Arrange
    mock.on(GetObjectCommand).resolves({ Body: "data" });
    const client = new S3Client({});

    // Act
    const result = await client.send(
      new GetObjectCommand({
        Bucket: "b",
        Key: "k",
      }),
    );

    // Assert
    expect(result.Body).toBe("data");
  });
});
```

### Test Coverage Requirements

- **New features:** Must include tests
- **Bug fixes:** Must include regression tests
- **Edge cases:** Test error conditions and boundaries

## 📝 Commit Message Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `test:` - Test additions/changes
- `refactor:` - Code refactoring (no functional changes)
- `perf:` - Performance improvements
- `chore:` - Build process, dependencies, tooling
- `ci:` - CI/CD changes
- `style:` - Code style changes (formatting, etc.)

### Examples

```bash
# Feature
feat(matchers): add toHaveReceivedCommandOnce matcher

# Bug fix
fix(mock-client): resolve WeakMap memory leak issue

# Documentation
docs(readme): update installation instructions

# Breaking change
feat(api)!: change mockClient return type

BREAKING CHANGE: mockClient now returns AwsClientStub instead of Mock
```

### Rules

- ✅ Use present tense ("add" not "added")
- ✅ Use imperative mood ("move" not "moves")
- ✅ Capitalize first letter of subject
- ✅ No period at the end of subject
- ✅ Limit subject line to 72 characters
- ✅ Separate subject from body with blank line
- ✅ Wrap body at 72 characters
- ✅ Use body to explain what and why, not how

## 🚀 Release Process

Releases are managed by maintainers using `nx release`.

### Versioning

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0) - Breaking changes
- **MINOR** (0.1.0) - New features (backward compatible)
- **PATCH** (0.0.1) - Bug fixes (backward compatible)

### Release Steps (Maintainers Only)

```bash
# Dry run to preview changes
bun nx release --dry-run

# Create release
bun nx release

# Publish to npm
bun publish
```

## 🎓 Learning Resources

### Recommended Reading

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Vitest Documentation](https://vitest.dev/)
- [AWS SDK v3 Documentation](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [Conventional Commits](https://www.conventionalcommits.org/)

### Internal Documentation

- [Architecture Overview](./docs/architecture.md) (if exists)
- [API Design Decisions](./docs/api-design.md) (if exists)

## ❓ Questions?

- 💬 [GitHub Discussions](https://github.com/sudokar/aws-sdk-vitest-mock/discussions)
- 🐛 [Issue Tracker](https://github.com/sudokar/aws-sdk-vitest-mock/issues)
- 📧 Email: maintainer@example.com

## 🙏 Recognition

Contributors will be recognized in:

- README.md contributors section
- Release notes
- GitHub contributors page

Thank you for contributing! 🎉

---

**Remember:** Every contribution matters, no matter how small! 💪
