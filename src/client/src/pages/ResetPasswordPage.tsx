/**
 * Page ouverte depuis le lien de l'email : /reinitialiser?jeton=…
 * On choisit un nouveau mot de passe ; l'API vérifie le jeton (valable 30 min, une seule fois).
 */
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api, errorMessage } from "../api/client.ts";
import { ErrorMessage } from "../components/Status.tsx";
import { useAuth } from "../context/AuthContext.tsx";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("jeton");
  const { setCurrentUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  if (!token) {
    return (
      <section className="auth-card">
        <h1>Lien incomplet</h1>
        <p>Ce lien de réinitialisation est incomplet. Copiez l'adresse entière depuis l'email, ou refaites une demande.</p>
        <p>
          <Link to="/mot-de-passe-oublie">Refaire une demande</Link>
        </p>
      </section>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setIsSending(true);
    setError(null);
    try {
      await api("/auth/reset-password", {
        method: "POST",
        body: { token, newPassword: String(form.get("newPassword")), confirm: String(form.get("confirm")) },
      });
      // toutes les sessions ont été fermées par l'API : on repart de la page de connexion
      setCurrentUser(null);
      navigate("/connexion", { replace: true, state: { message: "Mot de passe changé : connectez-vous avec le nouveau." } });
    } catch (caught) {
      setError(errorMessage(caught)); // ex. lien expiré ou déjà utilisé
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="auth-card">
      <h1>Nouveau mot de passe</h1>
      <form onSubmit={handleSubmit} className="form">
        <div className="field">
          <label htmlFor="new-password">Nouveau mot de passe</label>
          <input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={16}
            aria-describedby="new-password-help"
            required
          />
          <p id="new-password-help" className="field__help">
            8 à 16 caractères, avec une majuscule, une minuscule, un chiffre et un caractère spécial (!@#$%…).
          </p>
        </div>
        <div className="field">
          <label htmlFor="confirm">Confirmer le mot de passe</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </div>
        {error && <ErrorMessage message={error} />}
        <button type="submit" className="button" disabled={isSending}>
          {isSending ? "Enregistrement…" : "Changer le mot de passe"}
        </button>
      </form>
      {error && (
        <p>
          <Link to="/mot-de-passe-oublie">Refaire une demande de lien</Link>
        </p>
      )}
    </section>
  );
}
