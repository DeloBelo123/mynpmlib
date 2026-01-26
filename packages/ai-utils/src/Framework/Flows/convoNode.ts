import { Edge, NodeExecResult } from "./types"
import { Node } from "./node"
import { State } from "./types"
import { Agent } from "../../heart/agent"
import { agentFlow } from "./flow"
import { agentFlowSchema } from "./types"
import { AIMessage } from "../../imports"

export class ConvoNode extends Node<string> {
    public name: string
    public prompt: string
    public agent: Agent<typeof agentFlowSchema>
    public state: State | undefined
    public edges: Edge<string>[] = []

    constructor({name,prompt,agent = agentFlow}:{name:string,prompt:string,agent?:Agent<typeof agentFlowSchema>}){
        super()
        this.name = name
        this.prompt = prompt
        this.agent = agent
    }

    public setEdges(edges:Edge<string>[]):void{
        this.edges = edges
    }

    public setState(state:State){
        this.state = state
    }

    public async exec():Promise<NodeExecResult> {
        if(!this.state){
            throw new Error("State is not set")
        }
        this.state.step++
        this.state.nodes_visited.push(this.name)
        const result = await this.agent.invoke({
            thread_id: this.state.thread_id,
            messages: this.state.messages
        })
        this.state.messages.push(new AIMessage(result.content))
        return {
            state: this.state,
            next_node: result.next_node
        } satisfies NodeExecResult
    }
}