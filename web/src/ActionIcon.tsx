type ActionIconName = "add" | "save" | "palette" | "reset" | "connect" | "export" | "import";

const drawings: Record<ActionIconName, JSX.Element> = {
  add: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  save: <><path d="M4 12l5 5L20 6" /></>,
  palette: <><circle cx="12" cy="12" r="9" /><circle cx="7" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="15" cy="8" r="1" /><path d="M16 17h1a2 2 0 0 0 0-4h-1" /></>,
  reset: <><path d="M4 11a8 8 0 1 1 2.5 6" /><path d="M4 5v6h6" /></>,
  connect: <><circle cx="5" cy="12" r="2" /><circle cx="19" cy="12" r="2" /><path d="M7 12h10" /></>,
  export: <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 17v4h16v-4" /></>,
  import: <><path d="M12 17V5m0 0L8 9m4-4 4 4" /><path d="M4 17v4h16v-4" /></>
};

export function ActionIcon({ name }: { name: ActionIconName }): JSX.Element {
  return (
    <svg
      className="action-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {drawings[name]}
    </svg>
  );
}
