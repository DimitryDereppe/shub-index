/**
 * Page de connexion (US40). Formulaire non contrôlé : on lit les champs avec
 * FormData au moment de l'envoi, pas besoin d'un state par champ.
 */
import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { errorMessage } from "../api/client.ts";
import { ErrorMessage } from "../components/Status.tsx";
import { useAuth } from "../context/AuthContext.tsx";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  // page demandée avant la redirection vers /connexion (cf. RequireAuth)
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  // message laissé par une autre page (ex. « mot de passe changé, reconnecte-toi »)
  const notice = (location.state as { message?: string } | null)?.message;

  if (user) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); // pas de rechargement de la page
    const form = new FormData(event.currentTarget);
    setIsSending(true);
    setError(null);
    try {
      await login(String(form.get("email")), String(form.get("password")));
      navigate(from, { replace: true });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="auth-card">
      <h1>Connexion</h1>
      <p>Le catalogue des films du NAS est réservé aux membres.</p>
      {notice && <p role="status" className="status">{notice}</p>}

      <form onSubmit={handleSubmit} className="form">
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">Mot de passe</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {error && <ErrorMessage message={error} />}
        <button type="submit" className="button" disabled={isSending}>
          {isSending ? "Connexion…" : "Se connecter"}
        </button>
      </form>

      <p>
        <Link to="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
      </p>
      <p>
        Pas encore de compte ? <Link to="/inscription">Créer un compte</Link>
      </p>
    </section>
  );
}
