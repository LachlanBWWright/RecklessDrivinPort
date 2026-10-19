/// <reference lib="webworker" />
import { LuaAnalysisEngine, type LuaAnalysisRequest } from './lua-analysis';
const engine = new LuaAnalysisEngine();
addEventListener('message', (event: MessageEvent<LuaAnalysisRequest>) => postMessage(engine.run(event.data)));
