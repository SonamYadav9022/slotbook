import axios from "axios";

// The access token lives only in memory (not localStorage), so XSS can't steal a
// long-lived credential. The httpOnly refresh cookie restores the session on reload.
let accessToken = null;
export const setAccessToken = (token) => {
  accessToken = token;
};

const api = axios.create({ baseURL: "/api", withCredentials: true });

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshing = null;
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const isAuthCall = original?.url?.startsWith("/auth/");
    if (error.response?.status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        // One refresh shared by all requests that failed at the same moment.
        refreshing = refreshing || api.post("/auth/refresh").finally(() => (refreshing = null));
        const { data } = await refreshing;
        setAccessToken(data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        setAccessToken(null);
      }
    }
    return Promise.reject(error);
  }
);

export const errorMessage = (err) =>
  err.response?.data?.message || "Can't reach the server. Check your connection and try again.";

export default api;
