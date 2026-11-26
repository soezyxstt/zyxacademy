import JXG from "jsxgraph";

// functiongraph compiles its identity expression "x" with eval by default.
// Use JSXGraph's interpreter in this host so the strict local CSP can stay on.
JXG.Options.jc.compile = false;

export default JXG;
