'use client';

/** Écran S07 : état d'erreur. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <p className="text-sm text-gray-500">S07 · erreur</p>
      <h1 className="text-2xl font-semibold text-brand-blue">Une erreur est survenue</h1>
      <button className="mt-4 rounded bg-brand-blue px-4 py-2 text-white" onClick={() => reset()}>
        Réessayer
      </button>
    </main>
  );
}
