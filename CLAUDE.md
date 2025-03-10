# Instructions to use Claude Deskop / Claude Code

## Build & Test Commands
- Run all tests: `npm test`
- Run single test: `node  test/fgh.test.ts`
- Run specific test file: `node --no-warnings --experimental-strip-types --test test/comma-operator.test.ts`
- Lint: `npm run lint`
- Fix linting issues: `npm run lint:fix`
- Use the node-runner tool that you have available to run the npm scripts.

## Code Style Guidelines
- Use JavaScript with JSDoc annotations
- Follow ES module import syntax (import/export)
- Use descriptive variable names in camelCase
- Document public functions with JSDoc comments
- Use functional programming patterns when possible
- Maintain clear separation of components
- Avoid tight coupling between components
- Follow neostandard ESLint rules
- Keep functions small and focused on a single responsibility
- never add special cases for specific inputs
