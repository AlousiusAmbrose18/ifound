"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main>
      <h1>ifound could not display this workspace</h1>
      <p>
        Reload the workspace to try again. Your saved browser records remain
        available.
      </p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
