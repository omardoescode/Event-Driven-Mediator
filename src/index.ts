import fs from "fs";
import path from "path";
import Mediator from "./Mediator";
import YAMLWorkflowParser from "./workflow/YAMLWorkflowParser";
import RedisStateStore from "./state/RedisStateStore";
import redis_client from "./redis_client";

/**
 * Entry point for the Mediator service.
 * Initializes and starts the workflow orchestration system.
 */
const folder_name = "./workflows";
async function main() {
  const mediator = new Mediator(
    () => new YAMLWorkflowParser(),
    new RedisStateStore(redis_client),
  );
  const shutdown = async () => {
    console.log("Disconnecting Consumers...");
    await mediator.disconnect();
    console.log("Consumers Disconnected");

    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    const files = await fs.promises.readdir(folder_name);

    // Filter only YAML files (optional but recommended)
    const yamlFiles = files.filter(
      (file) => file.endsWith(".yml") || file.endsWith(".yaml"),
    );

    for (const file of yamlFiles) {
      const filePath = path.join(folder_name, file);
      await mediator.init_workflow(filePath);
    }

    await mediator.init_topics();
    await mediator.listen();
  } catch (err) {
    console.error(err);
    await mediator.disconnect();
  }
}

main();
