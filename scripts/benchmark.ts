import { runSimple } from "run-container";
import { $ } from "bun";
import chalk from "chalk";
import Docker from "dockerode";

const docker = new Docker(); // Initialize Docker client

async function buildDockerImage(
  contextPath: string,
  tag: string
): Promise<void> {
  console.log(chalk.blue(`Building Docker image: ${tag}`));

  try {
    const stream = await docker.buildImage(
      {
        context: contextPath,
        src: ["Dockerfile"],
      },
      { t: tag }
    );

    // Handle the build stream
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(
        stream,
        (err: Error | null, result: any[]) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(result);
        },
        (event: { stream?: string }) => {
          if (event.stream) {
            process.stdout.write(event.stream);
          }
        }
      );
    });

    console.log(chalk.green(`Successfully built image: ${tag}`));
  } catch (error) {
    console.error(chalk.red(`Failed to build image ${tag}:`), error);
    throw error;
  }
}

async function main() {
  console.log("Starting Benchmark:");

  // Build images first
  await $`docker build -t effectis-node:latest -f ./scripts/benchmark/effectis/node/Dockerfile .`;
  await $`docker build -t barebonesjs:latest -f ./scripts/benchmark/barebonesjs/Dockerfile .`;

  console.log("Started Redis Container");
  const redis = await runSimple({
    image: "redis",
    cmd: ["redis-server"],
    ports: {
      "6379": "6379",
    },
  });

  const { averageRPS: redisRPS } = await runBenchmark("Redis");

  await redis.stop();
  await redis.remove();

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

  const { averageRPS: idk } = await runBenchmark("Effectis");

  await effectisNodeSlow.stop();
  await effectisNodeSlow.remove();

  console.log("Starting Effectis (node) (fast parser) Container");
  const effectisNodeFast = await runSimple({
    image: "effectis-node", // Use the built image
    ports: {
      "6379": "6379",
    },
  });

  const { averageRPS: idk2 } = await runBenchmark("Effectis");

  await effectisNodeFast.stop();
  await effectisNodeFast.remove();

  console.log("Starting BarebonesJS Container");
  const barebonesjs = await runSimple({
    image: "barebonesjs:latest", // Use the built image
    ports: {
      "3000": "6379",
    },
  });
  await barebonesjs.stop();
  await barebonesjs.remove();
}

async function runBenchmark(name: string): Promise<{
  averageRPS: number;
}> {
  console.log(`Starting ${name} Benchmark`);
  const output = await $`redis-benchmark -t set,get -n 1000 -q`.text();
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
