import { randomBytes } from "crypto";

const secret = randomBytes(32).toString("hex");

console.log("\n  Generated SERVICE_SECRET:\n");
console.log(`  SERVICE_SECRET=${secret}`);
console.log("\n  Add this line to your service/.env file.\n");
