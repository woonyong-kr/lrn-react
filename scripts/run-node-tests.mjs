import { runComponentStateTests } from '../src/tests/component-state.test.js';
import { runAppTests } from '../src/tests/app.test.js';
import { installTestDomEnvironment } from '../src/tests/support/testDomEnvironment.js';

installTestDomEnvironment();
const results = [];
// Suites share a DOM and globals; run sequentially to avoid cross-suite interference.
for (const suite of [runComponentStateTests, runAppTests]) {
  for (const result of await suite()) {
    results.push(result);
    console.log(`[${result.passed ? 'PASS' : 'FAIL'}] ${result.name}${result.error ? ': ' + result.error : ''}`);
  }
}
const passed = results.filter(result => result.passed).length;
console.log(`Summary: total ${results.length}, passed ${passed}, failed ${results.length - passed}`);
if (passed !== results.length) process.exitCode = 1;
