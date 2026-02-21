import { describe, it, expect, vi, beforeEach } from "vitest"
import { HookEngine } from "../HookEngine"
import * as fs from "fs/promises"
import * as path from "path"
import { Task } from "../../core/task/Task"

vi.mock("fs/promises")
vi.mock("../../utils/fs", () => ({
    fileExistsAtPath: vi.fn(),
}))
import { fileExistsAtPath } from "../../utils/fs"

describe("HookEngine", () => {
    let hookEngine: HookEngine
    let mockTask: any

    beforeEach(() => {
        vi.clearAllMocks()
        // Reset singleton instance if necessary, or just use getInstance
        hookEngine = HookEngine.getInstance()
        // Manually reset private state for tests since it's a singleton
        ;(hookEngine as any).activeIntents = new Map()

        mockTask = {
            taskId: "test-task-id",
            cwd: "/mock/cwd",
        }
    })

    describe("Scope Enforcement", () => {
        const intentsYaml = `
- id: "INT-001"
  owned_scope:
    - "src/hooks/"
    - "docs/README.md"
`

        it("allows authorized file paths", async () => {
            vi.mocked(fileExistsAtPath).mockResolvedValue(true)
            vi.mocked(fs.readFile).mockResolvedValue(intentsYaml)

            // Select intent
            await hookEngine.postToolExecution("select_active_intent", { intent_id: "INT-001" }, "Selected", mockTask)

            // Test authorized paths
            await expect(hookEngine.preToolExecution("write_to_file", { path: "/mock/cwd/src/hooks/test.ts" }, mockTask))
                .resolves.not.toThrow()
            await expect(hookEngine.preToolExecution("write_to_file", { path: "/mock/cwd/docs/README.md" }, mockTask))
                .resolves.not.toThrow()
        })

        it("throws Scope Violation for unauthorized paths", async () => {
            vi.mocked(fileExistsAtPath).mockResolvedValue(true)
            vi.mocked(fs.readFile).mockResolvedValue(intentsYaml)

            // Select intent
            await hookEngine.postToolExecution("select_active_intent", { intent_id: "INT-001" }, "Selected", mockTask)

            // Test unauthorized path
            await expect(hookEngine.preToolExecution("write_to_file", { path: "/mock/cwd/package.json" }, mockTask))
                .rejects.toThrow("Scope Violation")
        })

        it("warns but doesn't throw if no intent is selected (non-strict mode by default)", async () => {
             await expect(hookEngine.preToolExecution("write_to_file", { path: "/mock/cwd/any.ts" }, mockTask))
                .resolves.not.toThrow()
        })
    })

    describe("Traceability", () => {
        it("logs actions to agent_trace.jsonl in postToolExecution", async () => {
             // Select intent
            await hookEngine.postToolExecution("select_active_intent", { intent_id: "INT-001" }, "Selected", mockTask)

            const params = { path: "test.ts", content: "const x = 1;" }
            const result = "File written"

            await hookEngine.postToolExecution("write_to_file", params, result, mockTask)

            expect(fs.appendFile).toHaveBeenCalledWith(
                expect.stringContaining(path.join(".orchestration", "agent_trace.jsonl")),
                expect.stringContaining('"intent_id":"INT-001"')
            )
            expect(fs.appendFile).toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining('"tool":"write_to_file"')
            )
        })
    })
})
