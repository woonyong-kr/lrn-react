import { runComponentStateTests } from '../src/tests/component-state.test.js';
import { runAppTests } from "../src/tests/app.test.js";
import { installTestDomEnvironment } from "../src/tests/support/testDomEnvironment.js";
import { runEngineTests } from "../src/tests/engine.test.js";
import { runHistoryTests } from "../src/tests/history.test.js";
import { runInspectTests } from "../src/tests/inspect.test.js";
import { runIntegrationTests } from "../src/tests/integration.test.js";
import { runPatchTests } from "../src/tests/patch.test.js";
import { runPokeApiClientTests } from "../src/tests/pokeApiClient.test.js";
import { runReconcilerTests } from "../src/tests/reconciler.test.js";
import { runRuntimeTests } from "../src/tests/runtime.test.js";
import { runUtilsTests } from "../src/tests/utils.test.js";
import { runVnodeTests } from "../src/tests/vnode.test.js";

installTestDomEnvironment();

const suites = [
  { name: "component-state", run: runComponentStateTests },
  { name: "vnode", run: runVnodeTests },
  { name: "reconciler", run: runReconcilerTests },
  { name: "patch", run: runPatchTests },
  { name: "pokeApiClient", run: runPokeApiClientTests },
  { name: "history", run: runHistoryTests },
  { name: "engine", run: runEngineTests },
  { name: "integration", run: runIntegrationTests },
  { name: "runtime", run: runRuntimeTests },
  { name: "app", run: runAppTests },
  { name: "utils", run: runUtilsTests },
  { name: "inspect", run: runInspectTests },
];

async function main() {
  const groupedCases = await Promise.all(
    suites.map(async (suite) => {
      const cases = await suite.run();
      return cases.map((testCase) => ({
        suite: suite.name,
        ...testCase,
      }));
    })
  );

  const flatCases = groupedCases.flat();

  const summary = flatCases.reduce(
    (result, testCase) => {
      result.total += 1;

      if (testCase.skipped) {
        result.skipped += 1;
        return result;
      }

      if (testCase.passed) {
        result.passed += 1;
        return result;
      }

      result.failed += 1;
      return result;
    },
    { total: 0, passed: 0, failed: 0, skipped: 0 }
  );

  for (const testCase of flatCases) {
    const prefix = testCase.skipped ? "SKIP" : testCase.passed ? "PASS" : "FAIL";
    const detail = testCase.error ? `: ${testCase.error}` : "";
    console.log(`[${prefix}] ${testCase.suite} :: ${testCase.name}${detail}`);
  }

  console.log("");
  console.log(
    `Summary: total ${summary.total}, passed ${summary.passed}, failed ${summary.failed}, skipped ${summary.skipped}`
  );

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

await main();
