
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Get directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use absolute path for the test file
const testFilePath = join(__dirname, 'test', 'origin-based-routing.test.js');

console.log(`Running test file: ${testFilePath}`);

// Run the test
const testProcess = spawn('node', ['--test', testFilePath], {
  stdio: 'inherit'
});

testProcess.on('exit', (code) => {
  console.log(`Test exited with code ${code}`);
  process.exit(code);
});
