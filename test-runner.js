
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs/promises';
import path from 'node:path';

// Get directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runTest(testFile) {
  console.log(`=== Running test file: ${testFile} ===`);
  return new Promise((resolve) => {
    const testProcess = spawn('node', ['--test', testFile], {
      stdio: 'inherit'
    });

    testProcess.on('exit', (code) => {
      console.log(`Test exited with code ${code}`);
      console.log('-'.repeat(80));
      resolve(code === 0);
    });
  });
}

async function main() {
  const testDir = join(__dirname, 'test');
  const files = await fs.readdir(testDir);
  const testFiles = files.filter(file => file.endsWith('.test.js'));
  
  console.log(`Found ${testFiles.length} test files`);
  
  let passedTests = 0;
  let failedTests = 0;
  const failedTestFiles = [];
  
  for (const file of testFiles) {
    const testFile = join(testDir, file);
    const passed = await runTest(testFile);
    
    if (passed) {
      passedTests++;
    } else {
      failedTests++;
      failedTestFiles.push(file);
    }
  }
  
  console.log('=== Test Summary ===');
  console.log(`Total tests: ${testFiles.length}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  
  if (failedTests > 0) {
    console.log('\nFailed test files:');
    failedTestFiles.forEach(file => console.log(`- ${file}`));
  }
}

main().catch(err => console.error('Error running tests:', err));
