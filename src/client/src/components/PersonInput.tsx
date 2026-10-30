/**
 * Champ texte avec autocomplétion des noms (US11).
 *
 * <datalist> est l'autocomplétion native du HTML : le navigateur affiche les
 * suggestions sous le champ, au clavier comme à la souris, sans librairie.
 * On recharge les suggestions (GET /people?q=…) à chaque frappe, après une
 * courte pause (300 ms) pour ne pas envoyer une requête par lettre.
 */
import { useEffect, useState } from "react";
import { api } from "../api/client.ts";
import type { PersonRef } from "../api/types.ts";

interface PersonInputProps {
  id: string;
  name: string;
  label: string;
  role: "director" | "actor";
  defaultValue: string;
}

export function PersonInput({ id, name, label, role, defaultValue }: PersonInputProps) {
  const [text, setText] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<PersonRef[]>([]);

  useEffect(() => {
    if (text.trim().length < 2) {
      return;
    }
    const controller = new AbortController();
    // setTimeout + clearTimeout dans le cleanup : si l'utilisateur tape encore, l'appel précédent est annulé
    const timer = setTimeout(() => {
      api<PersonRef[]>(`/people?${new URLSearchParams({ q: text.trim(), role })}`, { signal: controller.signal })
        .then(setSuggestions)
        .catch(() => setSuggestions([])); // l'autocomplétion est un bonus : en cas d'erreur, rien
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, role]);

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        list={`${id}-suggestions`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        autoComplete="off"
      />
      <datalist id={`${id}-suggestions`}>
        {suggestions.map((person) => (
          <option key={person.id} value={person.name} />
        ))}
      </datalist>
    </div>
  );
}
