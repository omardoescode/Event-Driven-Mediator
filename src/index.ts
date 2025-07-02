import Mediator from "./Mediator";

async function main() {
  const mediator = Mediator.instance();
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
