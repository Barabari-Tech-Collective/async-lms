import axios from "axios";

const getToken = () => {
  return localStorage.getItem("token");
};

const apiClient = axios.create({
  // Ensure this matches your Vite/Env variable name
  baseURL: (import.meta.env.VITE_API_URL || "") + "/api/v1",
});

// Request Interceptor: Adds the token to every outgoing request
apiClient.interceptors.request.use(
  (config) => {
    const token = getToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor: Handles 401 (Unauthorized) by clearing session and redirecting
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url ?? "";
    const isAuthEndpoint = url.includes("/auth/");
    if (error.response?.status === 401 && !isAuthEndpoint) {
      localStorage.removeItem("token");
      if (window.location.pathname !== "/") {
        window.location.href = "/";
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
