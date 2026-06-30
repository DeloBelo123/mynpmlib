import { write_n_run_js, write_n_run_py, write_n_run } from "@delofarag/base-utils/server";

write_n_run_js("test.js",
`
const name = "Jeff"
console.log(name)    
`,
false,
true
)