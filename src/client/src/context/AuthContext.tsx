/**
 * Contexte d'authentification (Context API) : l'utilisateur connecté est
 * disponible partout via le hook useAuth(), sans le passer de props en props.
 *
 * Le JWT est dans un cookie httpOnly : le client ne le lit jamais. Pour savoir
 * qui est connecté, il demande simplement GET /api/auth/me au démarrage.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client.ts";
import type { User } from "../api/types.ts";

interface AuthContextValue {
  user: User | null;
  isReady: boolean; // false tant qu'on ne sait pas encore si quelqu'un est connecté
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  // après PATCH /me : nouvelles infos ; après changement de mot de passe ou suppression : null
  setCurrentUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);

  // au chargement de l'application : y a-t-il déjà une session (cookies encore valides) ?
  useEffect(() => {
    api<User>("/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsReady(true));
  }, []);

  async function login(email: string, password: string) {
    await api("/auth/login", { method: "POST", body: { email, password } });
    setUser(await api<User>("/auth/me"));
  }

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      setUser(null); // même si l'API ne répond pas, on oublie l'utilisateur côté client
    }
  }

  return <AuthContext.Provider value={{ user, isReady, login, logout, setCurrentUser: setUser }}>{children}</AuthContext.Provider>;
}

/** Hook personnalisé : const { user, login } = useAuth(); */
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth() doit être utilisé à l'intérieur de <AuthProvider>");
  }
  return context;
}
