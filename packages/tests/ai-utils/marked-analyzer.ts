import { Agent, ToolRegistry, Chain } from "../../ai-utils/src";
import global_load_envs from "../load_envs"
import { z } from "zod/v3";
global_load_envs()

const marketTool = new ToolRegistry([])