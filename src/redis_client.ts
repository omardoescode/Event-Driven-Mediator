import { createClient } from "redis";

const redis_client = createClient({ url: "redis://localhost:6379" });

redis_client.connect().then(() => {
  console.log("✅ Connected to Redis");
});

redis_client.on("error", (err) => {
  console.error("❌ Redis Client Error", err);
});

export default redis_client;
