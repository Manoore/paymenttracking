import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Capture Hub",
    short_name: "Capture",
    description: "Private hub for payment proof, expenses and reimbursements.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#4f46e5",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
    // Installed on Android, "Share → Capture Hub" opens a prefilled capture.
    share_target: { action: "/new", method: "GET", params: { title: "title", text: "text", url: "url" } },
  } as MetadataRoute.Manifest;
}
