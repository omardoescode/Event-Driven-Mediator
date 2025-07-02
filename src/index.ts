import Mediator from "./Mediator";
import YAMLWorkflowParser from "./workflow/YAMLWorkflowParser";

async function main() {
  const mediator = new Mediator(() => new YAMLWorkflowParser());
  try {
    await mediator.init_workflows("./workflows");
    await mediator.init_topics();
    await mediator.listen();
  } catch (err) {
    console.error(err);
    await mediator.disconnect();
  }
}

main();
