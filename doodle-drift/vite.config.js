import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var nodeEnv = mode === "production" ? "production" : "development";
    return {
        base: "./",
        plugins: [react()],
        define: {
            "process.env.NODE_ENV": JSON.stringify(nodeEnv),
            "process.env": JSON.stringify({ NODE_ENV: nodeEnv }),
        },
        resolve: {
            alias: {
                "@": path.resolve(__dirname, "./src"),
            },
        },
        server: {
            port: 5181,
            cors: true,
        },
        build: {
            outDir: "dist",
            emptyOutDir: true,
            rollupOptions: {
                input: path.resolve(__dirname, "index.html"),
            },
        },
    };
});
