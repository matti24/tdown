import Globe3DDemo from "@/components/3d-globe-demo";

export default function App() {
  return (
    <main className="relative h-screen w-full overflow-hidden bg-neutral-950">
      {/* Soft background glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(77,166,255,0.12),transparent_60%)]" />

      <div className="relative z-10 h-full w-full">
        <Globe3DDemo />
      </div>
    </main>
  );
}
