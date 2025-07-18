# EventDrivenMediator

**EventDrivenMediator** is a TypeScript-based event-driven workflow orchestrator for microservices. Define, execute, and monitor distributed workflows using YAML, Kafka, and Redis.

## Features

- **Event-Driven Orchestration:** Coordinate complex, multi-step workflows across services using events.
- **Declarative YAML Workflows:** Write clear, versioned workflow definitions in YAML.
- **Flexible Step Types:** Support for event-based steps, custom actions, and conditional logic.
- **Success & Failure Handling:** Built-in retry, abort, and custom actions for robust error handling.
- **State Management:** Persist workflow and step state in Redis for reliability and recovery.
- **Kafka Integration:** Use Kafka topics for scalable, decoupled event transport.

## Example: Defining a Workflow

Below is a real-world workflow example inspired by `workflows/test.yml`:

```yaml
name: test-workflow
version: 0.0.1
initiating_event:
  name: InitiatingEvent
  topic: test-workflow.init

steps:
  - name: SandboxCreation
    type: event
    topic: sandbox.execute.create
    depends_on: []
    input:
      name: "{{InitiatingEvent.name}}"
    response: topic
    response_topic:
      success:
        - sandbox.success.create
      failure:
        - sandbox.failure.create
    on_success:
      - action: log
        message: "Sandbox created"
      - action: log_output
    on_failure:
      action: retry
      max_attempts: 3
      action_after_retry_all: abort

  - name: ExecutorTest
    type: event
    topic: executor.execute.test
    depends_on: [SandboxCreation]
    input:
      sandbox_container_id: "{{SandboxCreation.container_id}}"
      sandbox_server_address: "{{SandboxCreation.server_address}}"
    response: topic
    response_topic:
      success:
        - executor.success.test
      failure:
        - executor.failure.test
    on_failure:
      action: abort
```

### How It Works
- **Initiating Event:** The workflow starts when an event is published to `test-workflow.init`.
- **Step 1: SandboxCreation:**
  - Triggers an event to `sandbox.execute.create`.
  - Waits for a success or failure response on the specified topics.
  - On success, logs output; on failure, retries up to 3 times, then aborts.
- **Step 2: ExecutorTest:**
  - Runs after `SandboxCreation` succeeds.
  - Sends an event to `executor.execute.test` with data from the previous step.
  - Aborts the workflow on failure.

## Getting Started

### Prerequisites
- Node.js (v16+)
- Redis
- Kafka

### Installation

```bash
# Clone the repository and install dependencies
 git clone https://github.com/yourusername/EventDrivenMediator.git
 cd EventDrivenMediator
 bun install
```

### Configuration

Set up your Kafka and Redis connections in a `.env` file or via environment variables.

### Running the Mediator

```bash
bun run src/index.ts
```

## Usage

- Place your workflow YAML files in the `workflows/` directory.
- Implement custom action handlers as needed.
- Trigger workflows by publishing events to the initiating Kafka topic.

## Contributing

Contributions are welcome! Please open issues or submit pull requests for improvements and bug fixes.

---

**EventDrivenMediator** – Orchestrate your microservices with events, not spaghetti code.