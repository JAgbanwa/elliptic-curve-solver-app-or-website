"use client";
import { useState, useEffect, useCallback } from "react";

export type MemoryType =
  | "assumption"
  | "notation"
  | "definition"
  | "result"
  | "lemma";

export interface MathMemory {
  id: string;
  type: MemoryType;
  title: string;
  content: string;
  /** Single-letter variable names that trigger auto-surfacing */
  variables: string[];
  created: number;
  updated: number;
  pinned: boolean;
}

export const TYPE_META: Record<
  MemoryType,
  { icon: string; label: string; desc: string }
> = {
  assumption: {
    icon: "⊢",
    label: "Assumption",
    desc: "Running hypothesis or constraint (e.g. 'n is squarefree')",
  },
  notation: {
    icon: "≝",
    label: "Notation",
    desc: "Symbol or convention (e.g. 'Δ = discriminant')",
  },
  definition: {
    icon: "∷",
    label: "Definition",
    desc: "Named object or concept",
  },
  result: {
    icon: "∴",
    label: "Result",
    desc: "Computed fact or theorem reference",
  },
  lemma: {
    icon: "◻",
    label: "Lemma",
    desc: "Intermediate result or useful observation",
  },
};

const STORAGE_KEY = "ec-math-memory-v1";

const SEEDS: MathMemory[] = [
  {
    id: "seed-standard-weierstrass",
    type: "notation",
    title: "Short Weierstrass form",
    content:
      "y² = x³ + ax + b,  Δ = −16(4a³ + 27b²) ≠ 0.  Discriminant non-zero ⟺ curve is non-singular.",
    variables: ["a", "b"],
    created: Date.now() - 7 * 86400_000,
    updated: Date.now() - 7 * 86400_000,
    pinned: true,
  },
  {
    id: "seed-mordell-weil",
    type: "result",
    title: "Mordell-Weil theorem",
    content:
      "E(ℚ) ≅ ℤʳ ⊕ T where r ≥ 0 is the rank and T is finite torsion. Mazur: T ∈ {15 possible groups}.",
    variables: [],
    created: Date.now() - 6 * 86400_000,
    updated: Date.now() - 6 * 86400_000,
    pinned: false,
  },
];

function load(): MathMemory[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      // First visit: save and return seeds
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEEDS));
      return SEEDS;
    }
    return JSON.parse(raw) as MathMemory[];
  } catch {
    return [];
  }
}

export function useMemory() {
  const [memories, setMemories] = useState<MathMemory[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setMemories(load());
    setReady(true);
  }, []);

  const persist = useCallback((next: MathMemory[]) => {
    setMemories(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  }, []);

  const add = useCallback(
    (
      fields: Pick<
        MathMemory,
        "type" | "title" | "content" | "variables" | "pinned"
      >
    ): MathMemory => {
      const m: MathMemory = {
        ...fields,
        id: crypto.randomUUID(),
        created: Date.now(),
        updated: Date.now(),
      };
      persist([m, ...memories]);
      return m;
    },
    [memories, persist]
  );

  const update = useCallback(
    (
      id: string,
      fields: Partial<
        Pick<MathMemory, "type" | "title" | "content" | "variables" | "pinned">
      >
    ) => {
      persist(
        memories.map((m) =>
          m.id === id ? { ...m, ...fields, updated: Date.now() } : m
        )
      );
    },
    [memories, persist]
  );

  const remove = useCallback(
    (id: string) => {
      persist(memories.filter((m) => m.id !== id));
    },
    [memories, persist]
  );

  const togglePin = useCallback(
    (id: string) => {
      persist(
        memories.map((m) =>
          m.id === id
            ? { ...m, pinned: !m.pinned, updated: Date.now() }
            : m
        )
      );
    },
    [memories, persist]
  );

  /**
   * Returns: all pinned memories PLUS any unpinned memories whose variable
   * tags overlap the given set. Pinned entries come first; within each group
   * memories are in insertion order.
   */
  const relevant = useCallback(
    (vars: string[]): MathMemory[] => {
      const pinned = memories.filter((m) => m.pinned);
      const pinnedIds = new Set(pinned.map((m) => m.id));
      const tagged =
        vars.length > 0
          ? memories.filter(
              (m) =>
                !pinnedIds.has(m.id) &&
                m.variables.some((v) => vars.includes(v))
            )
          : [];
      return [...pinned, ...tagged];
    },
    [memories]
  );

  const exportText = useCallback((): string => {
    const lines: string[] = [
      "# Mathematical Memory",
      `# Exported ${new Date().toISOString().slice(0, 10)}`,
      "",
    ];
    for (const m of memories) {
      const varStr = m.variables.length
        ? `  [vars: ${m.variables.join(", ")}]`
        : "";
      const pin = m.pinned ? "  ★" : "";
      lines.push(`[${m.type.toUpperCase()}]${varStr}${pin}`);
      lines.push(m.title);
      if (m.content) lines.push(m.content);
      lines.push(`— ${new Date(m.created).toISOString().slice(0, 10)}`);
      lines.push("");
    }
    return lines.join("\n");
  }, [memories]);

  const clearAll = useCallback(() => persist([]), [persist]);

  return {
    memories,
    ready,
    add,
    update,
    remove,
    togglePin,
    relevant,
    exportText,
    clearAll,
  };
}
