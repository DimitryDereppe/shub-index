/**
 * Point d'entrée du client : routes (createBrowserRouter) + fournisseur d'authentification.
 *
 * Arbre des routes :
 *   /connexion, /inscription              publiques
 *   /, /films/:id, /personnes/:id, /compte  membre connecté (RequireAuth)
 *   /admin/indexations, /admin/fichiers,
 *   /admin/comptes                        admin (RequireAdmin)
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import "./index.css";
import { Layout } from "./components/Layout.tsx";
import { RequireAdmin, RequireAuth } from "./components/RouteGuards.tsx";
import { AuthProvider } from "./context/AuthContext.tsx";
import { AccountPage } from "./pages/AccountPage.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { MoviePage } from "./pages/MoviePage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { PersonPage } from "./pages/PersonPage.tsx";
import { RegisterPage } from "./pages/RegisterPage.tsx";
import { SearchPage } from "./pages/SearchPage.tsx";
import { MediaFilesPage } from "./pages/admin/MediaFilesPage.tsx";
import { ScansPage } from "./pages/admin/ScansPage.tsx";
import { UsersPage } from "./pages/admin/UsersPage.tsx";

const router = createBrowserRouter([
  {
    element: <Layout />, // en-tête + <Outlet /> commun à toutes les pages
    children: [
      { path: "/connexion", element: <LoginPage /> },
      { path: "/inscription", element: <RegisterPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: "/", element: <SearchPage /> },
          { path: "/films/:id", element: <MoviePage /> },
          { path: "/personnes/:id", element: <PersonPage /> },
          { path: "/compte", element: <AccountPage /> },
          {
            element: <RequireAdmin />,
            children: [
              { path: "/admin/indexations", element: <ScansPage /> },
              { path: "/admin/fichiers", element: <MediaFilesPage /> },
              { path: "/admin/comptes", element: <UsersPage /> },
            ],
          },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);
