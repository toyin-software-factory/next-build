// Dynamic: the board reads D1 per request and is never prebuilt (spec 0001).
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Next Build</h1>
      <p className="text-lg text-neutral-700">
        Suggest what we build next and upvote the ideas you want. The board is coming soon.
      </p>
    </main>
  );
}
