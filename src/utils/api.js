const BASE = import.meta.env.VITE_API_URL;

function getToken() {
  const raw =
    sessionStorage.getItem("user") || localStorage.getItem("user");
  if (!raw) return null;
  try {
    return JSON.parse(raw)?.token ?? null;
  } catch {
    return null;
  }
}

// Recursively copies _id → id on any object/array returned by Mongoose
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const out = { ...value };
    if (out._id !== undefined && out.id === undefined) {
      out.id = out._id;
    }
    for (const key of Object.keys(out)) {
      out[key] = normalize(out[key]);
    }
    return out;
  }
  return value;
}

async function request(method, path, body) {
  const token = getToken();

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = await res.json();

  if (!json.success) {
    const err = new Error(json.message || "Request failed");
    err.status = res.status;
    throw err;
  }

  if (json.data !== undefined) {
    return normalize(json.data);
  }

  if (json.user && json.token) {
    return normalize({ ...json.user, token: json.token });
  }

  if (json.user) {
    return normalize(json.user);
  }

  return normalize(json);
}

export const api = {
  get:    (path)       => request("GET",    path),
  post:   (path, body) => request("POST",   path, body),
  patch:  (path, body) => request("PATCH",  path, body),
  delete: (path)       => request("DELETE", path),
};
