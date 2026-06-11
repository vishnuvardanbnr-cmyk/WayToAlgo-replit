export default function SpaceBackground() {
  return (
    <>
      {/* Faint data grid */}
      <div className="app-grid" aria-hidden="true" />

      {/* Ambient gradient glows */}
      <div className="app-glow app-glow-primary" aria-hidden="true" />
      <div className="app-glow app-glow-secondary" aria-hidden="true" />

      {/* Top sheen */}
      <div className="app-sheen" aria-hidden="true" />
    </>
  );
}
