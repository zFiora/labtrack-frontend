import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../utils/api.js";

function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [passwords, setPasswords] = useState({
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const isStrongPassword = (password) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!isStrongPassword(passwords.password)) {
      setError("Password must be at least 8 characters and include uppercase, lowercase, and a number.");
      return;
    }

    if (passwords.password !== passwords.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSaving(true);
    try {
      await api.post(`/auth/reset-password/${token}`, {
        password: passwords.password,
      });
      setPasswords({ password: "", confirmPassword: "" });
      setSuccessMessage("Password reset successfully. You can now sign in.");
    } catch (err) {
      setError(err.message || "Reset link is invalid or expired.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050b18] px-4 text-white">
      <div className="w-full max-w-md rounded-xl bg-[#0b1424] p-8 shadow-lg">
        <h1 className="mb-2 text-center text-2xl font-bold text-cyan-400">
          LabTrack
        </h1>
        <p className="mb-6 text-center text-gray-400">Reset your password</p>

        {successMessage && (
          <p className="mb-4 rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-400">
            {successMessage}
          </p>
        )}

        {error && (
          <p className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="New password"
            value={passwords.password}
            onChange={(event) => setPasswords({ ...passwords, password: event.target.value })}
            className="w-full rounded-md bg-[#0f1b33] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={passwords.confirmPassword}
            onChange={(event) => setPasswords({ ...passwords, confirmPassword: event.target.value })}
            className="w-full rounded-md bg-[#0f1b33] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
          />

          <button
            type="submit"
            disabled={isSaving || Boolean(successMessage)}
            className="w-full rounded-md bg-cyan-500 py-3 font-semibold hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Reset password"}
          </button>

          <button
            type="button"
            onClick={() => navigate("/")}
            className="w-full rounded-md border border-[#1d2b45] py-3 font-semibold text-gray-300 transition hover:border-cyan-500 hover:text-cyan-400"
          >
            Back to sign in
          </button>
        </form>
      </div>
    </div>
  );
}

export default ResetPasswordPage;
