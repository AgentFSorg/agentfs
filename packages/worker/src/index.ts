import { runLoop } from "./loop.js";

runLoop().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
