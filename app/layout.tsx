import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Video Generator",
  description: "Generate simple videos in your browser with ffmpeg.wasm",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
