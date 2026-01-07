import React, { ReactNode } from "react";
import { type Dispatch, SetStateAction } from "react";
interface sharedStateType<T> {
    sharedState: T;
    setSharedState: Dispatch<SetStateAction<T>>;
}
export declare const SharedState: React.Context<sharedStateType<any> | undefined>;
export declare function GlobalState({ children, initial }: {
    children: ReactNode;
    initial?: any;
}): React.JSX.Element;
export declare function useSharedState(): sharedStateType<any>;
export {};
//# sourceMappingURL=GlobalState.d.ts.map