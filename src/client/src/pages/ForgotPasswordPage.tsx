/**
 * « Mot de passe oublié » : on saisit son email, l'API envoie un lien de réinitialisation.
 * L'API répond toujours la même chose (compte existant ou non) : on affiche simplement son message.
 */
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { api, errorMessage } from "../api/client.ts";
import { ErrorMessage } from "../components/Status.tsx";

export function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email"));
    setIsSending(true);
    setError(null);
    try {
      const response = await api<{ message: string }>("/auth/forgot-password", { method: "POST", body: { email } });
      setMessage(response.message);
    } catch (caught) {
      setError(errorMessage(caught)); // ex. 429 : trop de demandes
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="auth-card">
      <h1>Mot de passe oublié</h1>

      {message ? (
        <>
          <p role="status">{message}</p>
          <p className="field__help">Pensez à regarder dans les indésirables. Le lien est valable 30 minutes.</p>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="form">
          <p>Indiquez l'email de votre compte : nous vous enverrons un lien pour choisir un nouveau mot de passe.</p>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required maxLength={128} />
          </div>
          {error && <ErrorMessage message={error} />}
          <button type="submit" className="button" disabled={isSending}>
            {isSending ? "Envoi…" : "Recevoir le lien"}
          </button>
        </form>
      )}

      <p>
        <Link to="/connexion">← Retour à la connexion</Link>
      </p>
    </section>
  );
}
