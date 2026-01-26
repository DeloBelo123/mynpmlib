import { NodeExecResult, State } from "./types"
import { Edge } from "./types"

export abstract class Node<T> {
    public abstract exec():Promise<NodeExecResult>
    public abstract setState(state:State):void
    public abstract setEdges(edges:Edge<T>[]):void
}