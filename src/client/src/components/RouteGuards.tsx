/**
 * Routes protégées : si la condition n'est pas remplie, on redirige au lieu
 * d'afficher la page. Ce n'est qu'un confort d'affichage — la vraie protection
 * est faite par l'API (isConnected, checkRoles), qui refuse de toute façon.
 */
import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../context/AuthContext.tsx";
import { Loading } from "./Status.tsx";

/** Pages réservées aux membres connectés. */
export function RequireAuth() {
  const { user, isReady } = useAuth();
  const location = useLocation();

  if (!isReady) {
    return <Loading />;
  }
  if (!user) {
    // on mémorise la page demandée pour y revenir après la connexion
    return <Navigate to="/connexion" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

/** Pages réservées aux admins (à placer à l'intérieur de RequireAuth). */
export function RequireAdmin() {
  const { user } = useAuth();
  return user?.role === "admin" ? <Outlet /> : <Navigate to="/" replace />;
}
