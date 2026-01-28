import { runLoop } from "./loop.js";

runLoop().catch((err) => {
   
  console.error(err);
  process.exit(1);
});
