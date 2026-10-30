/**
 * Page « Mon compte » : profil, favoris, historique, mot de passe, suppression du compte.
 * Toutes les routes appelées sont /me/… : l'API agit sur l'utilisateur connecté (cookie).
 */
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { api, errorMessage } from "../api/client.ts";
import { MAX_FAVORITES, type FavoriteMovie, type User, type WatchedMovie } from "../api/types.ts";
import { MovieGrid } from "../components/MovieCard.tsx";
import { ErrorMessage, Loading } from "../components/Status.tsx";
import { useAuth } from "../context/AuthContext.tsx";
import { useApi } from "../hooks/useApi.ts";

export function AccountPage() {
  return (
    <>
      <h1>Mon compte</h1>
      <FavoritesSection />
      <HistorySection />
      <ProfileSection />
      <PasswordSection />
      <DeleteAccountSection />
    </>
  );
}

// ---------------------------------------------------------------------------
// Favoris
// ---------------------------------------------------------------------------
function FavoritesSection() {
  const favorites = useApi<FavoriteMovie[]>("/me/favorites");
  const [error, setError] = useState<string | null>(null);

  async function remove(movieId: number) {
    setError(null);
    try {
      await api(`/me/favorites/${movieId}`, { method: "DELETE" });
      favorites.reload();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <section aria-labelledby="favorites-title" className="account-section">
      <h2 id="favorites-title">
        Mes favoris {favorites.status === "success" && `(${favorites.data.length} / ${MAX_FAVORITES})`}
      </h2>
      {favorites.status === "loading" && <Loading />}
      {favorites.status === "error" && <ErrorMessage message={favorites.error} />}
      {favorites.status === "success" &&
        (favorites.data.length === 0 ? (
          <p>Aucun favori pour l'instant : utilise le bouton ☆ sur la fiche d'un film.</p>
        ) : (
          <MovieGrid
            movies={favorites.data}
            renderActions={(movie) => (
              <button type="button" className="button button--ghost" onClick={() => remove(movie.id)}>
                Retirer <span className="visually-hidden">{movie.title} des favoris</span>
              </button>
            )}
          />
        ))}
      {error && <ErrorMessage message={error} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Historique (10 derniers films lancés dans VLC)
// ---------------------------------------------------------------------------
function HistorySection() {
  const history = useApi<WatchedMovie[]>("/me/history");
  const [error, setError] = useState<string | null>(null);

  // path "" → vide tout l'historique ; "/42" → retire le film 42
  async function remove(path: string) {
    setError(null);
    try {
      await api(`/me/history${path}`, { method: "DELETE" });
      history.reload();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <section aria-labelledby="history-title" className="account-section">
      <h2 id="history-title">Derniers films regardés</h2>
      <p className="field__help">Un film est noté ici quand tu le lances avec « Lire dans VLC ».</p>
      {history.status === "loading" && <Loading />}
      {history.status === "error" && <ErrorMessage message={history.error} />}
      {history.status === "success" &&
        (history.data.length === 0 ? (
          <p>Aucun film regardé pour l'instant.</p>
        ) : (
          <>
            <MovieGrid
              movies={history.data}
              renderActions={(movie) => (
                <>
                  <span className="field__help">
                    {new Date(movie.watchedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                  </span>
                  <button type="button" className="button button--ghost" onClick={() => remove(`/${movie.id}`)}>
                    ✕ <span className="visually-hidden">Retirer {movie.title} de l'historique</span>
                  </button>
                </>
              )}
            />
            <p>
              <button type="button" className="button button--ghost" onClick={() => remove("")}>
                Vider l'historique
              </button>
            </p>
          </>
        ))}
      {error && <ErrorMessage message={error} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Profil : prénom, nom, email (mot de passe demandé seulement si l'email change)
// ---------------------------------------------------------------------------
function ProfileSection() {
  const { user, setCurrentUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [email, setEmail] = useState(user?.email ?? "");

  if (!user) {
    return null; // impossible ici (RequireAuth), mais rassure TypeScript
  }
  const emailChanged = email.trim() !== user.email;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setSaved(false);
    try {
      const updated = await api<User>("/me", {
        method: "PATCH",
        body: {
          firstname: String(form.get("firstname")).trim(),
          lastname: String(form.get("lastname")).trim(),
          // l'email et le mot de passe ne partent que si l'email a changé
          ...(emailChanged && { email: email.trim(), currentPassword: String(form.get("currentPassword")) }),
        },
      });
      setCurrentUser({ ...user!, ...updated }); // l'en-tête et le reste du site voient les nouvelles infos
      setSaved(true);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <section aria-labelledby="profile-title" className="account-section">
      <h2 id="profile-title">Mes informations</h2>
      <form onSubmit={handleSubmit} className="form account-form">
        <div className="field">
          <label htmlFor="firstname">Prénom</label>
          <input id="firstname" name="firstname" defaultValue={user.firstname} required maxLength={128} autoComplete="given-name" />
        </div>
        <div className="field">
          <label htmlFor="lastname">Nom</label>
          <input id="lastname" name="lastname" defaultValue={user.lastname} required maxLength={128} autoComplete="family-name" />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={128} autoComplete="email" />
        </div>
        {emailChanged && (
          <div className="field">
            <label htmlFor="profile-password">Mot de passe actuel</label>
            <input id="profile-password" name="currentPassword" type="password" required autoComplete="current-password" />
            <p className="field__help">Demandé pour changer d'email : c'est ton identifiant de connexion.</p>
          </div>
        )}
        {error && <ErrorMessage message={error} />}
        {saved && <p role="status" className="status">Informations enregistrées.</p>}
        <div>
          <button type="submit" className="button">Enregistrer</button>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Mot de passe : après le changement, toutes les sessions sont fermées
// ---------------------------------------------------------------------------
function PasswordSection() {
  const { setCurrentUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    try {
      await api("/me/password", {
        method: "PATCH",
        body: {
          currentPassword: String(form.get("currentPassword")),
          newPassword: String(form.get("newPassword")),
          confirm: String(form.get("confirm")),
        },
      });
      // l'API a effacé les cookies : on oublie l'utilisateur et on l'envoie se reconnecter
      setCurrentUser(null);
      navigate("/connexion", { state: { message: "Mot de passe changé : reconnecte-toi avec le nouveau." } });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <section aria-labelledby="password-title" className="account-section">
      <h2 id="password-title">Changer de mot de passe</h2>
      <form onSubmit={handleSubmit} className="form account-form">
        <div className="field">
          <label htmlFor="current-password">Mot de passe actuel</label>
          <input id="current-password" name="currentPassword" type="password" required autoComplete="current-password" />
        </div>
        <div className="field">
          <label htmlFor="new-password">Nouveau mot de passe</label>
          <input id="new-password" name="newPassword" type="password" required autoComplete="new-password" aria-describedby="new-password-help" />
          <p id="new-password-help" className="field__help">
            8 à 16 caractères, avec une majuscule, une minuscule, un chiffre et un caractère spécial.
          </p>
        </div>
        <div className="field">
          <label htmlFor="confirm-password">Confirmation</label>
          <input id="confirm-password" name="confirm" type="password" required autoComplete="new-password" />
        </div>
        {error && <ErrorMessage message={error} />}
        <div>
          <button type="submit" className="button">Changer le mot de passe</button>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Suppression du compte (mot de passe requis, définitive)
// ---------------------------------------------------------------------------
function DeleteAccountSection() {
  const { setCurrentUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    try {
      await api("/me", { method: "DELETE", body: { password: String(form.get("password")) } });
      setCurrentUser(null);
      navigate("/connexion", { state: { message: "Ton compte a été supprimé." } });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <section aria-labelledby="delete-title" className="account-section account-section--danger">
      <h2 id="delete-title">Supprimer mon compte</h2>
      <p>Définitif : ton compte, tes favoris et ton historique seront effacés.</p>
      <form onSubmit={handleSubmit} className="form account-form">
        <div className="field">
          <label htmlFor="delete-password">Mot de passe</label>
          <input id="delete-password" name="password" type="password" required autoComplete="current-password" />
        </div>
        {error && <ErrorMessage message={error} />}
        <div>
          <button type="submit" className="button button--danger">Supprimer définitivement</button>
        </div>
      </form>
    </section>
  );
}
