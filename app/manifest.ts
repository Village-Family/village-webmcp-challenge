import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Village Family",
    short_name: "Village",
    description: "Shared shifts, childcare and family logistics for real life.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7faf7",
    theme_color: "#5f8f72",
    orientation: "portrait-primary",
    categories: ["lifestyle", "productivity"],
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
