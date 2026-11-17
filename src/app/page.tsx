import { EmptyState } from "@/components/EmptyState";
import { IdeaForm } from "@/components/IdeaForm";
import { IdeaList } from "@/components/IdeaList";
import { getBoard } from "@/db/queries";
import { getVoterId } from "@/lib/voter";

// Dynamic: the board reads D1 per request and is never prebuilt (spec 0001).
export const dynamic = "force-dynamic";

// No try/catch: a failed read throws to error.tsx, which renders inside the layout.
export default async function HomePage() {
  const board = await getBoard((await getVoterId()) ?? "");
  return (
    <>
      <IdeaForm />
      {board.length === 0 ? <EmptyState /> : <IdeaList ideas={board} />}
    </>
  );
}
