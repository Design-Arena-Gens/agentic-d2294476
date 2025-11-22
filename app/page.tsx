import dynamic from "next/dynamic";

const VideoGenerator = dynamic(() => import("@/components/VideoGenerator"), { ssr: false });

export default function Page() {
  return (
    <main className="container">
      <header>
        <h1>Video Generator</h1>
        <p>Create short videos from text, right in your browser.</p>
      </header>
      <VideoGenerator />
      <footer>
        <p className="muted">No uploads. Everything runs locally in your browser.</p>
      </footer>
    </main>
  );
}
