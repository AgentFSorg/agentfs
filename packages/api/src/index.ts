import { createApp } from "./server.js";

async function main() {
  const { app, env } = await createApp({ logger: true });
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
