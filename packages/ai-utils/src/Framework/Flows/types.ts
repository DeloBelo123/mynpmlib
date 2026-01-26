import { BaseMessage } from "../../imports"
import { z } from "zod/v3"

export interface State {
    messages: BaseMessage[]
    nodes_visited: string[]
    thread_id: string
    step: number 
}

export interface NodeExecResult {
    state: State
    next_node: string
}

export type Edge<T> = [string,T]

export const agentFlowSchema = z.object({
    next_node: z.string().describe("Der nächste Node der besucht werden soll"),
    content: z.string() //das hier ist nur dummy
})