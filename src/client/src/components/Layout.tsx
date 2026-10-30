/**
 * Mise en page commune : lien d'évitement, en-tête avec navigation, contenu de la page (Outlet).
 */
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext.tsx";

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/connexion");
  }

  return (
    <>
      {/* lien d'évitement : au clavier, Tab puis Entrée saute directement au contenu */}
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>

      <header className="site-header">
        <Link to="/" className="site-header__brand">
          shub-index
        </Link>

        {user && (
          <nav aria-label="Navigation principale">
            <ul className="site-nav">
              <li>
                <NavLink to="/" end>
                  Recherche
                </NavLink>
              </li>
              <li>
                <NavLink to="/compte">Mon compte</NavLink>
              </li>
              {user.role === "admin" && (
                <>
                  <li>
                    <NavLink to="/admin/indexations">Indexation</NavLink>
                  </li>
                  <li>
                    <NavLink to="/admin/fichiers">Fichiers</NavLink>
                  </li>
                  <li>
                    <NavLink to="/admin/comptes">Comptes</NavLink>
                  </li>
                </>
              )}
              <li>
                <button type="button" className="button button--ghost" onClick={handleLogout}>
                  Se déconnecter <span className="visually-hidden">({user.firstname})</span>
                </button>
              </li>
            </ul>
          </nav>
        )}
      </header>

      {/* tabIndex={-1} : la cible du lien d'évitement peut recevoir le focus */}
      <main id="contenu" tabIndex={-1} className="page">
        <Outlet />
      </main>
    </>
  );
}
