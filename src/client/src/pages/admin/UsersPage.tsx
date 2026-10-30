/**
 * Comptes (admin) : liste, promotion / rétrogradation (US42), suppression (US43).
 * Son propre compte n'est pas modifiable (l'API le refuse aussi, 409).
 */
import { useState } from "react";
import { api, errorMessage } from "../../api/client.ts";
import type { AdminUser, Role } from "../../api/types.ts";
import { ErrorMessage, Loading } from "../../components/Status.tsx";
import { useAuth } from "../../context/AuthContext.tsx";
import { useApi } from "../../hooks/useApi.ts";
import { formatDate } from "../../utils/format.ts";

export function UsersPage() {
  const { user: me } = useAuth();
  const users = useApi<AdminUser[]>("/users");
  const [error, setError] = useState<string | null>(null);

  async function changeRole(user: AdminUser, role: Role) {
    setError(null);
    try {
      await api(`/users/${user.id}`, { method: "PATCH", body: { role } });
      users.reload();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function remove(user: AdminUser) {
    // confirmation : la suppression est définitive
    if (!window.confirm(`Supprimer le compte de ${user.firstname} ${user.lastname} ?`)) {
      return;
    }
    setError(null);
    try {
      await api(`/users/${user.id}`, { method: "DELETE" });
      users.reload();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <>
      <h1>Comptes</h1>
      {error && <ErrorMessage message={error} />}
      {users.status === "loading" && <Loading />}
      {users.status === "error" && <ErrorMessage message={users.error} />}
      {users.status === "success" && (
        <div className="table-wrapper">
          <table className="table">
            <caption className="visually-hidden">Comptes inscrits</caption>
            <thead>
              <tr>
                <th scope="col">Nom</th>
                <th scope="col">Email</th>
                <th scope="col">Inscrit le</th>
                <th scope="col">Rôle</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((user) => {
                const isMe = user.id === me?.id;
                return (
                  <tr key={user.id}>
                    <td>
                      {user.firstname} {user.lastname} {isMe && "(vous)"}
                    </td>
                    <td>{user.email}</td>
                    <td>{formatDate(user.created_at)}</td>
                    <td>
                      <label htmlFor={`role-${user.id}`} className="visually-hidden">
                        Rôle de {user.firstname} {user.lastname}
                      </label>
                      <select
                        id={`role-${user.id}`}
                        value={user.role}
                        disabled={isMe}
                        onChange={(event) => changeRole(user, event.target.value as Role)}
                      >
                        <option value="member">Membre</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>
                      {!isMe && (
                        <button type="button" className="button button--danger" onClick={() => remove(user)}>
                          Supprimer <span className="visually-hidden">{user.firstname} {user.lastname}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
