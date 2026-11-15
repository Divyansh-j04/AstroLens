import objects from '@data/objects.json'

// Phase 0 placeholder. The 3D scene replaces this in Phase 1.
export default function App() {
  return (
    <main className="flex h-full items-center justify-center text-slate-300">
      <p data-testid="status">AstroLens: {objects.length} objects loaded</p>
    </main>
  )
}
