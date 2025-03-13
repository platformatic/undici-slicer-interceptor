
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Get directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Script to run specific tests
const testFiles = [
  join(__dirname, 'test', 'origin-based-routing.test.js'),
  join(__dirname, 'test', 'origin-based-routing-extended.test.js')
];

// Run both test files
for (const testFile of testFiles) {
  console.log(`Running test file: ${testFile}`);
  const testProcess = spawn('node', ['--test', testFile], {
    stdio: 'inherit'
  });

  await new Promise((resolve) => {
    testProcess.on('exit', (code) => {
      console.log(`Test ${testFile} exited with code ${code}`);
      resolve();
    });
  });
}
