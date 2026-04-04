import dotenv from "dotenv";
import { createApp } from "./app.js";

dotenv.config();

const port = process.env.PORT || 4000;
const app = createApp();

app.listen(port, () => {
  console.log(`Kick and Chill Hub API running on http://localhost:${port}`);
});
