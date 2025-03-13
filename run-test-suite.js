
import { spawn } from 'node:child_process';

// Run all tests
const testProcess = spawn('node', ['--test'], {
  cwd: '/Users/matteo/repos/make-cacheable-interceptor',
  stdio: 'inherit'
});

testProcess.on('exit', (code) => {
  console.log(`Test suite exited with code ${code}`);
  process.exit(code);
});
