const CURRENT_USER_KEY = "user";

export function getCurrentUser() {
  const storedUser =
    sessionStorage.getItem(CURRENT_USER_KEY) ||
    localStorage.getItem(CURRENT_USER_KEY);

  if (!storedUser) return null;

  try {
    return JSON.parse(storedUser);
  } catch (_) {
    return null;
  }
}

export function setCurrentUser(user, rememberMe = false) {
  const serializedUser = JSON.stringify(user);

  sessionStorage.setItem(CURRENT_USER_KEY, serializedUser);

  if (rememberMe) {
    localStorage.setItem(CURRENT_USER_KEY, serializedUser);
  } else {
    localStorage.removeItem(CURRENT_USER_KEY);
  }
}

export function updateCurrentUser(patch) {
  const current = getCurrentUser();
  if (!current) return null;

  const updated = { ...current, ...patch };
  const serializedUser = JSON.stringify(updated);

  if (sessionStorage.getItem(CURRENT_USER_KEY)) {
    sessionStorage.setItem(CURRENT_USER_KEY, serializedUser);
  }

  if (localStorage.getItem(CURRENT_USER_KEY)) {
    localStorage.setItem(CURRENT_USER_KEY, serializedUser);
  }

  return updated;
}

export function clearCurrentUser() {
  sessionStorage.removeItem(CURRENT_USER_KEY);
  localStorage.removeItem(CURRENT_USER_KEY);
}
