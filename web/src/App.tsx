import { BoardCanvas } from "./BoardCanvas";
import type { Board } from "./types";

const board: Board = {
  width: 64,
  height: 40,
  gridPitchMm: 2.54
};

export function App(): JSX.Element {
  return (
    <main className="app-root">
      <header className="toolbar">
        <h1>uniuni</h1>
        <p>Universal perfboard CAD (MVP bootstrap)</p>
      </header>
      <BoardCanvas board={board} />
    </main>
  );
}
