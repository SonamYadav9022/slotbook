import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api, { setAccessToken } from "./api.js";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((data) => {
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  // Restore the session from the refresh cookie when the page loads.
  useEffect(() => {
    api
      .post("/auth/refresh")
      .then(({ data }) => apply(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apply]);

  const login = async (email, password) => apply((await api.post("/auth/login", { email, password })).data);
  const register = async (form) => apply((await api.post("/auth/register", form)).data);
  const logout = async () => {
    await api.post("/auth/logout").catch(() => {});
    setAccessToken(null);
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}
