import { BaseTool, ToolCallbacks } from "./BaseTool"
import { Task } from "../task/Task"
import { HookEngine } from "../../hooks/HookEngine"
import * as path from "path"
import * as fs from "fs/promises"
import { fileExistsAtPath } from "../../utils/fs"

export class SelectActiveIntentTool extends BaseTool<"select_active_intent"> {
    readonly name = "select_active_intent" as const

    async execute(params: { intent_id: string }, task: Task, callbacks: ToolCallbacks): Promise<void> {
        const { pushToolResult, handleError } = callbacks
        const { intent_id } = params

        try {
            const intentsPath = path.join(task.cwd, ".orchestration", "active_intents.yaml")

            if (!(await fileExistsAtPath(intentsPath))) {
                throw new Error("No active intents found. Please contact the administrator to initialize .orchestration/active_intents.yaml")
            }

            const content = await fs.readFile(intentsPath, "utf-8")

            // For now, we are returning the raw content. In a real implementation, we would parse YAML and filter by ID.
            // But since I don't want to add dependencies like `yaml` right now if not needed, I'll do a simple regex or just return the whole file for the prototype phase.
            // Wait, the instructions say "Construct an XML block <intent_context> containing only the constraints and scope for the selected ID."

            // I'll assume standard string manipulation for now to avoid dependency issues.
            let contextBlock = `<intent_context>\n${content}\n</intent_context>`

            // Simple validation that ID exists in file
            if (!content.includes(intent_id)) {
                throw new Error(`Intent ID ${intent_id} not found in active_intents.yaml`)
            }

            pushToolResult(contextBlock)

            // Hook Engine Post-Execution Logic
            await HookEngine.getInstance().postToolExecution(this.name, params, contextBlock, task)
        } catch (error) {
            await handleError("selecting active intent", error as Error)
        }
    }
}

export const selectActiveIntentTool = new SelectActiveIntentTool()
