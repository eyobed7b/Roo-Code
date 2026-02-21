# Roo Code: AI-Native IDE Implementation Report

## 1. Executive Summary

This report details the transformation of Roo Code into an **AI-Native IDE** featuring a deterministic governance layer and semantic traceability. We have successfully implemented a **Hook System** that intercepts tool executions, enforces intent-based policies, and maintains a sidecar trace of all agent actions.

### Key Achievements:

- **Deterministic Hook Engine**: A middleware layer integrated into the base tool class.
- **Intent-Driven Handshake**: A new protocol requiring agents to declare their intent before execution.
- **Semantic Tracing**: Automated logging of actions with content hashes and Git metadata.
- **Automated Scope Enforcement**: Real-time validation of file access against the active intent's authorized scope.

---

## 2. Architecture & Design

### 2.1 Component Overview

The architecture follows a middleware pattern where the `HookEngine` acts as a central authority for tool governance.

```mermaid
graph TD
    subgraph Agent Loop
        Agent[Roo Agent] -->|Tool Call| BaseTool[BaseTool.ts]
    end

    subgraph Governance Layer (Middleware)
        BaseTool -->|Pre-Hook| HookEngine[HookEngine.ts]
        HookEngine -->|Validate| Intents[(active_intents.yaml)]
        HookEngine -->|Error/Proceed| BaseTool
    end

    subgraph Execution
        BaseTool -->|Execute| ToolLogic[Tool Implementation]
        ToolLogic -->|Result| BaseTool
    end

    subgraph Traceability
        BaseTool -->|Post-Hook| HookEngine
        HookEngine -->|Log| Trace[(agent_trace.jsonl)]
    end
```

### 2.2 The Deterministic Hook System

The hook system is integrated into `src/core/tools/BaseTool.ts`, ensuring that _every_ tool (current and future) is automatically governed.

- **Pre-Execution Hook**: Intercepts parameters before execution. Used for scope validation and state checks.
- **Post-Execution Hook**: Intercepts results after execution. Used for logging, auditing, and state transitions.

---

## 3. Data Schemas

### 3.1 Active Intent Schema (`.orchestration/active_intents.yaml`)

This file defines the available tasks and their authorized boundaries.

```yaml
- id: string # Unique ID (e.g., INT-001)
  name: string # Human-readable name
  status: string # pending | IN_PROGRESS | completed
  owned_scope: # List of paths or globs authorized for edit
      - "src/core/**"
  constraints: # List of rules to follow
      - "Must maintain type safety"
  acceptance_criteria: # Definition of done
      - "Tests pass"
```

### 3.2 Agent Trace Schema (`.orchestration/agent_trace.jsonl`)

A machine-readable log of all agent actions for auditing and rollback.

```json
{
	"timestamp": "ISO-8601",
	"intent_id": "string",
	"tool": "string",
	"params": {
		"path": "string",
		"content_hash": "sha256"
	},
	"result_summary": "string",
	"git": {
		"branch": "string",
		"commit": "string"
	}
}
```

---

## 4. Agent Flow Breakdown

### Step 1: Intent Selection (Handshake)

Before performing any task, the agent MUST call `select_active_intent(intent_id)`.

- **Effect**: Loads the intent context into the `HookEngine`.
- **System Prompt**: Enforces this as the first mandatory action.

### Step 2: Policy Enforcement (Pre-Hook)

When a tool (e.g., `write_to_file`) is called:

1. `BaseTool` triggers `HookEngine.preToolExecution`.
2. `HookEngine` checks if the target path is within the `owned_scope` of the active intent.
3. If not, a `Scope Violation` error is returned, blocking the action before it touches the disk.

### Step 3: Action Execution

If validated, the tool executes its core logic.

### Step 4: Semantic Logging (Post-Hook)

After success:

1. `BaseTool` triggers `HookEngine.postToolExecution`.
2. `HookEngine` calculates a SHA-256 hash of any modified content.
3. A trace entry is appended to `.orchestration/agent_trace.jsonl`.

---

## 5. Technical Implementation Details

### 5.1 The Hook Hub (`src/hooks/HookEngine.ts`)

The `HookEngine` manages the active intent state and executes the logic for both pre and post hooks.

```typescript
public async preToolExecution(toolName: string, params: any, task: Task): Promise<void> {
    const intentId = this.activeIntents.get(task.taskId)
    if (toolName === "write_to_file") {
        if (intentId) {
            await this.enforceScope(intentId, params.path, task)
        }
    }
}
```

### 5.2 Base Tool Instrumentation (`src/core/tools/BaseTool.ts`)

All tools benefit from the hook system by extending `BaseTool`.

```typescript
// Hook Engine: Pre-execution
await HookEngine.getInstance().preToolExecution(this.name, params, task)

// core execution
await this.execute(params, task, callbacks)

// Hook Engine: Post-execution
await HookEngine.getInstance().postToolExecution(this.name, params, executionResult, task)
```

### 5.3 Scope Enforcement Logic

The system uses the `active_intents.yaml` as the source of truth for authorized paths. It supports directory-based scoping and exact file matches.

---

## 6. Implementation Notes

- **Singleton Pattern**: The `HookEngine` uses a singleton pattern to maintain consistent state across multiple tool calls within a task.
- **Optimistic Locking**: The system is designed to support future concurrency features by comparing file hashes in the pre-hook.
- **Minimal Intrusion**: By instrumenting the `BaseTool` class, we achieved 100% tool coverage with modification to only a few lines of core code.

---

## 7. Summary of Work Done

1.  **Explored and Documented** the core Roo Code architecture.
2.  **Designed** the AI-Native IDE roadmap (Phases 0-4).
3.  **Developed** the `HookEngine` for middleware governance.
4.  **Integrated** hooks into the `BaseTool` lifecycle.
5.  **Implemented** `SelectActiveIntentTool` to enable the reasoning handshake.
6.  **Created** the `.orchestration` data layer for persistence.
7.  **Verified** scope enforcement and semantic tracing via automated unit tests.

---

## 8. Verification & Testing

### 8.1 Automated Unit Tests

We have implemented a comprehensive test suite for the `HookEngine` in `src/hooks/__tests__/HookEngine.test.ts`.

- **Scope Enforcement Tests**: Verified that the engine correctly identifies authorized vs. unauthorized paths based on the `active_intents.yaml`.
- **Traceability Tests**: Verified that every `write_to_file` operation result is anchored to an intent and appended to the `.orchestration/agent_trace.jsonl` with a content hash.

### 8.2 Manual Verification (The Demo)

The following manual walkthrough was performed to verify the end-to-end handshake:

1. **Handshake**: Agent calls `select_active_intent(id)`. Result: Intent context loaded.
2. **Authorized Edit**: Agent calls `write_to_file` on a path in `owned_scope`. Result: Edit succeeds, trace entry created.
3. **Unauthorized Edit**: Agent calls `write_to_file` on a path NOT in `owned_scope`. Result: `Scope Violation` error thrown, edit blocked.

---

_Report generated on 2026-02-20_
