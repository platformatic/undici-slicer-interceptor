
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Get directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test file to run
const testFile = join(__dirname, 'test', 'simplified-origin-test.js');

console.log(`Running test file: ${testFile}`);

// Run the test
const testProcess = spawn('node', ['--test', testFile], {
  stdio: 'inherit'
});

// Set a timeout to avoid hanging
const timeout = setTimeout(() => {
  console.error('Test execution timed out after 10 seconds');
  testProcess.kill();
  process.exit(1);
}, 10000);

testProcess.on('exit', (code) => {
  clearTimeout(timeout);
  console.log(`Test exited with code ${code}`);
  process.exit(code);
});
