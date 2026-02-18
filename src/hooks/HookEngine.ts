import type { Task } from "../core/task/Task"
import * as path from "path"
import * as fs from "fs/promises"
import * as crypto from "crypto"
import { fileExistsAtPath } from "../utils/fs"
import { parse as parseYaml } from "yaml"
import { getGitMetadata } from "../utils/git"

interface ActiveIntent {
    id: string
    name: string
    status: "pending" | "in_progress" | "completed"
    owned_scope: string[]
    constraints: string[]
    acceptance_criteria: string[]
}

export class HookEngine {
    private static instance: HookEngine
    private activeIntents: Map<string, string> = new Map(); // taskId -> intentId

    private constructor() { }

    public static getInstance(): HookEngine {
        if (!HookEngine.instance) {
            HookEngine.instance = new HookEngine()
        }
        return HookEngine.instance
    }

    public async preToolExecution(toolName: string, params: any, task: Task): Promise<void> {
        console.log(`[HookEngine] Pre-tool execution: ${toolName}`)

        const intentId = this.activeIntents.get(task.taskId)

        if (toolName === "write_to_file") {
            if (!intentId) {
                console.warn("[HookEngine] WRITE attempted without Active Intent")
                // In strict mode, we might throw an error here.
                // throw new Error("Intent Enforcement: You must select an active intent before editing files.")
            } else {
                await this.enforceScope(intentId, params.path, task)
            }
        }
    }

    public async postToolExecution(toolName: string, params: any, result: any, task: Task): Promise<void> {
        console.log(`[HookEngine] Post-tool execution: ${toolName}`)

        if (toolName === "select_active_intent") {
            if (params.intent_id) {
                this.activeIntents.set(task.taskId, params.intent_id)
                console.log(`[HookEngine] Set active intent ${params.intent_id} for task ${task.taskId}`)
            }
        } else if (toolName === "write_to_file") {
            await this.traceAction(toolName, params, result, task)
        }
    }

    private async traceAction(toolName: string, params: any, result: any, task: Task): Promise<void> {
        const intentId = this.activeIntents.get(task.taskId)
        if (!intentId) return

        const traceFile = path.join(task.cwd, ".orchestration", "agent_trace.jsonl")
        // Ensure .orchestration exists
        const orchestrationDir = path.dirname(traceFile)
        try {
            await fs.mkdir(orchestrationDir, { recursive: true })
        } catch { }

        const contentHash = crypto.createHash('sha256').update(params.content || "").digest('hex')

        const traceEntry = {
            timestamp: new Date().toISOString(),
            intent_id: intentId,
            tool: toolName,
            params: {
                path: params.path,
                // content: truncated? or hash? use hash above
                content_hash: contentHash
            },
            result_summary: typeof result === 'string' ? result.substring(0, 100) : "Result too large/complex",
            file_hash: contentHash,
            git: await getGitMetadata(task.cwd)
        }

        await fs.appendFile(traceFile, JSON.stringify(traceEntry) + "\n")
    }

    private async enforceScope(intentId: string, filePath: string, task: Task): Promise<void> {
        const intentsPath = path.join(task.cwd, ".orchestration", "active_intents.yaml")
        if (!await fileExistsAtPath(intentsPath)) return

        try {
            const content = await fs.readFile(intentsPath, "utf-8")
            const intents = parseYaml(content) as ActiveIntent[]
            // Handles both array (standard) and object (if named keys) structures, but assuming array based on description
            const intent = Array.isArray(intents) ? intents.find(i => i.id === intentId) : null

            if (!intent) {
                console.warn(`[HookEngine] Intent ${intentId} not found in yaml`)
                return
            }

            // Normalize paths
            const relativePath = path.relative(task.cwd, filePath)

            // Check if file is in owned_scope
            const isAllowed = intent.owned_scope.some(scope => {
                // specific file match
                if (scope === relativePath || scope === filePath) return true
                // directory match (simple prefix)
                if (relativePath.startsWith(scope) || filePath.startsWith(scope)) return true
                // glob patterns could be added here
                return false
            })

            if (!isAllowed) {
                throw new Error(`Scope Violation: Intent '${intentId}' is not authorized to edit '${relativePath}'. Owned scopes: ${JSON.stringify(intent.owned_scope)}`)
            }

        } catch (error) {
            if (error instanceof Error && error.message.startsWith("Scope Violation")) {
                throw error
            }
            console.error("[HookEngine] Error enforcing scope:", error)
        }
    }
}
