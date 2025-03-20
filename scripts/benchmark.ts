import { runSimple } from "run-container";
import { $ } from "bun";
import chalk from "chalk";

const benchmarkScript = "redis-benchmark -t set,get -n 100 -q";
const runBenchmarkCommand = () =>
  $`redis-benchmark -t set,get -n 100 -q`.text();
const runJitCommand = () => $`redis-benchmark -t set,get -n 100 -q`.quiet();

async function main() {
  console.log("Starting Benchmark:");

  // Build images first
  //   await $`docker build -t effectis-node:latest -f ./scripts/benchmark/effectis/node/Dockerfile .`;
  //   await $`docker build -t effectis-bun:latest -f ./scripts/benchmark/effectis/bun/Dockerfile .`;
  //   await $`docker build -t barebonesjs:latest -f ./scripts/benchmark/barebonesjs/Dockerfile .`;

  console.log("Started Redis Container");
  const redis = await runSimple({
    image: "redis",
    cmd: ["redis-server"],
    ports: {
      "6379": "6379",
    },
  });

  const { averageRPS: redisRPS } = await runBenchmark("Redis").finally(
    async () => {
      await redis.stop();
      await redis.remove();
    }
  );

  console.log("Starting Effectis (node) (slow parser) Container");
  const effectisNodeSlow = await runSimple({
    image: "effectis-node", // Use the built image
    env: {
      SLOW_PARSER: "1",
    },
    ports: {
      "6379": "6379",
    },
  });

  const { averageRPS: effectisNodeSlowRPS } = await runBenchmark(
    "Effectis (node) (slow parser)"
  ).finally(async () => {
    await effectisNodeSlow.stop();
    await effectisNodeSlow.remove();
  });

  console.log("Starting Effectis (node) (fast parser) Container");
  const effectisNodeFast = await runSimple({
    image: "effectis-node", // Use the built image
    ports: {
      "6379": "6379",
    },
  });

  const { averageRPS: effectisNodeFastRPS } = await runBenchmark(
    "Effectis (node) (fast parser)"
  ).finally(async () => {
    await effectisNodeFast.stop();
    await effectisNodeFast.remove();
  });

  console.log("Starting Effectis (bun) (slow parser) Container");
  const effectisBunSlow = await runSimple({
    image: "effectis-bun", // Use the built image
    env: {
      SLOW_PARSER: "1",
    },
    ports: {
      "6379": "6379",
    },
  });

  const { averageRPS: effectisBunSlowRPS } = await runBenchmark(
    "Effectis (bun) (slow parser)"
  ).finally(async () => {
    await effectisBunSlow.stop();
    await effectisBunSlow.remove();
  });

  console.log("Starting Effectis (bun) (fast parser) Container");
  const effectisBunFast = await runSimple({
    image: "effectis-bun", // Use the built image
    ports: {
      "6379": "6379",
    },
  });

  const { averageRPS: effectisBunFastRPS } = await runBenchmark(
    "Effectis (bun) (fast parser)"
  ).finally(async () => {
    await effectisBunFast.stop();
    await effectisBunFast.remove();
  });

  console.log("Starting BarebonesJS Container");
  const barebonesjs = await runSimple({
    image: "barebonesjs:latest", // Use the built image
    ports: {
      "3000": "6379",
    },
  });

  const { averageRPS: barebonesJsRPS } = await runBenchmark(
    "Effectis (bun) (fast parser)"
  ).finally(async () => {
    await barebonesjs.stop();
    await barebonesjs.remove();
  });

  console.log("REPORT");
  console.log(`Benchmark command: \`${benchmarkScript}\``);
  console.log(`Redis Average RPS: ${redisRPS} - Reference`);
  console.log(
    `Effectis (node) (slow parser) Average RPS: ${effectisNodeSlowRPS} - Percentage of Reference: ${(
      (effectisNodeSlowRPS / redisRPS) *
      100
    ).toFixed(2)}%`
  );
  console.log(
    `Effectis (node) (fast parser) Average RPS: ${effectisNodeFastRPS} - Percentage of Reference: ${(
      (effectisNodeFastRPS / redisRPS) *
      100
    ).toFixed(2)}%`
  );
  console.log(
    `Effectis (bun) (slow parser) Average RPS: ${effectisBunSlowRPS} - Percentage of Reference: ${(
      (effectisBunSlowRPS / redisRPS) *
      100
    ).toFixed(2)}%`
  );
  console.log(
    `Effectis (bun) (fast parser) Average RPS: ${effectisBunFastRPS} - Percentage of Reference: ${(
      (effectisBunFastRPS / redisRPS) *
      100
    ).toFixed(2)}%`
  );
  console.log(
    `BarebonesJS Average RPS: ${barebonesJsRPS} - Percentage of Reference: ${(
      (barebonesJsRPS / redisRPS) *
      100
    ).toFixed(2)}%`
  );
}

async function runBenchmark(name: string): Promise<{
  averageRPS: number;
}> {
  console.log(`Starting ${name} Benchmark`);

  // warm jit
  await runJitCommand();
  const output = await runBenchmarkCommand();
  console.log(output);

  try {
    const lines = output.split("\n");
    const setLine = lines.find((line) => line.includes("SET"));
    const getLine = lines.find((line) => line.includes("GET"));
    if (!setLine || !getLine) {
      throw new Error("Failed to find set and get lines");
    }

    const setRPS = Number.parseInt(setLine.split(":")[1].trim());
    const getRPS = Number.parseInt(getLine.split(":")[1].trim());
    return {
      averageRPS: (setRPS + getRPS) / 2,
    };
  } catch (e) {
    console.log(`Failed to parse ${name} benchmark output`);
    console.error(e);
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  console.error(chalk.red("Benchmark failed:"), error);
  process.exit(1);
});
