/**
 * Page d'inscription (US39). Après création du compte, on connecte directement l'utilisateur.
 */
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { api, errorMessage } from "../api/client.ts";
import { ErrorMessage } from "../components/Status.tsx";
import { useAuth } from "../context/AuthContext.tsx";

export function RegisterPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  if (user) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Object.fromEntries : FormData → { firstname: "…", email: "…", … }
    const body = Object.fromEntries(new FormData(event.currentTarget));
    setIsSending(true);
    setError(null);
    try {
      await api("/auth/register", { method: "POST", body });
      await login(String(body.email), String(body.password));
      navigate("/", { replace: true });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="auth-card">
      <h1>Créer un compte</h1>

      <form onSubmit={handleSubmit} className="form">
        <div className="field">
          <label htmlFor="firstname">Prénom</label>
          <input id="firstname" name="firstname" autoComplete="given-name" required maxLength={128} />
        </div>
        <div className="field">
          <label htmlFor="lastname">Nom</label>
          <input id="lastname" name="lastname" autoComplete="family-name" required maxLength={128} />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required maxLength={128} />
        </div>
        <div className="field">
          <label htmlFor="password">Mot de passe</label>
          {/* aria-describedby : la règle est lue avec le champ par les lecteurs d'écran */}
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={16}
            aria-describedby="password-help"
            required
          />
          <p id="password-help" className="field__help">
            8 à 16 caractères, avec une majuscule, une minuscule, un chiffre et un caractère spécial (!@#$%…).
          </p>
        </div>
        <div className="field">
          <label htmlFor="confirm">Confirmer le mot de passe</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </div>
        {error && <ErrorMessage message={error} />}
        <button type="submit" className="button" disabled={isSending}>
          {isSending ? "Création…" : "Créer mon compte"}
        </button>
      </form>

      <p>
        Déjà inscrit ? <Link to="/connexion">Se connecter</Link>
      </p>
    </section>
  );
}
