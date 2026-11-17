import { getBoard } from "@/db/queries";
import { IdeaForm } from "@/components/IdeaForm";
import { getVoterId } from "@/lib/voter";

// Dynamic: the board reads D1 per request and is never prebuilt (spec 0001).
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const board = await getBoard((await getVoterId()) ?? "");
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Next Build</h1>
      <IdeaForm />
      <ul>
        {board.map((idea) => (
          <li key={idea.id}>
            {idea.text} ({idea.votes})
          </li>
        ))}
      </ul>
    </main>
  );
}
