import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/status")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        const body = {
          sources: [
            { name: "TGA", region: "MDSAP", status: "ok" },
            { name: "Health Canada", region: "MDSAP", status: "ok" },
            { name: "FDA MedWatch", region: "MDSAP", status: "ok" },
            { name: "FDA Recalls", region: "MDSAP", status: "ok" },
            { name: "MDCG", region: "EU", status: "ok" },
          ],
          lastRun: new Date().toISOString(),
        };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS },
        });
      },
    },
  },
});
