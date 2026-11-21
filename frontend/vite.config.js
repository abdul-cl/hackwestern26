import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server on localhost:5173 (the backend's CORS allows any localhost port).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: "localhost" },
});
