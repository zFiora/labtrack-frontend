import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCurrentUser,
  setCurrentUser,
} from "../../utils/authStorage.js";
import { api } from "../../utils/api.js";

function LoginPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("signin");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [signInData, setSignInData] = useState({
    identifier: "",
    password: "",
    rememberMe: false,
  });
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");

  const [registerData, setRegisterData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "student",
  });

  const [errors, setErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const currentUser = getCurrentUser();

    if (!currentUser?.role) return;

    if (currentUser.role === "admin") {
      navigate("/admin/users");
    } else if (currentUser.role === "instructor") {
      navigate("/instructor/labs");
    } else {
      navigate("/dashboard");
    }
  }, [navigate]);

  const isKfupmEmail = (email) => {
    return /^[^\s@]+@kfupm\.edu\.sa$/.test(email);
  };

  const isStrongPassword = (password) => {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
  };

  const handleSignIn = async (e) => {
    e?.preventDefault();

    const newErrors = {};

    if (!isKfupmEmail(signInData.identifier)) {
      newErrors.identifier = "Enter a valid KFUPM email.";
    }

    if (!signInData.password) {
      newErrors.password = "Password is required.";
    }

    setErrors(newErrors);
    setSuccessMessage("");

    if (Object.keys(newErrors).length > 0) return;

    try {
      const user = await api.post("/auth/login", {
        email: signInData.identifier,
        password: signInData.password,
      });
      setCurrentUser(user, signInData.rememberMe);

      if (user.role === "admin") {
        navigate("/admin/users");
      } else if (user.role === "instructor") {
        navigate("/instructor/labs");
      } else {
        navigate("/dashboard");
      }
    } catch (err) {
      if (err.status === 403) {
        setErrors({ identifier: "Your account has been deactivated." });
      } else {
        setErrors({ identifier: "Invalid email or password." });
      }
    }
  };
  const handleRegister = async () => {
    const newErrors = {};

    if (!registerData.fullName.trim()) {
      newErrors.fullName = "Full name is required.";
    }

    if (!isKfupmEmail(registerData.email)) {
      newErrors.email = "Enter a valid KFUPM email.";
    }

    if (!isStrongPassword(registerData.password)) {
      newErrors.registerPassword =
        "Password must be at least 8 characters and include uppercase, lowercase, and a number.";
    }

    if (registerData.confirmPassword !== registerData.password) {
      newErrors.confirmPassword = "Passwords do not match.";
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    try {
      await api.post("/auth/register", {
        fullName: registerData.fullName,
        email: registerData.email,
        password: registerData.password,
        role: registerData.role,
      });
      setSuccessMessage("Registration successful. You can now sign in.");
      setActiveTab("signin");
      setRegisterData({
        fullName: "",
        email: "",
        password: "",
        confirmPassword: "",
        role: "student",
      });
      setErrors({});
    } catch (err) {
      if (err.status === 409) {
        setErrors({ email: "An account with this email already exists." });
      } else {
        setErrors({ email: err.message || "Registration failed. Please try again." });
      }
    }
  };

  const handleForgotPassword = (e) => {
    e?.preventDefault();

    const newErrors = {};

    if (!isKfupmEmail(forgotPasswordEmail)) {
      newErrors.forgotPasswordEmail = "Enter a valid KFUPM email.";
    }

    setErrors(newErrors);
    setSuccessMessage("");

    if (Object.keys(newErrors).length > 0) return;

    setSignInData((currentData) => ({
      ...currentData,
      identifier: forgotPasswordEmail,
    }));
    setForgotPasswordEmail("");
    setShowForgotPassword(false);
    setActiveTab("signin");
    setSuccessMessage(
      "A reset link has been sent to your email. Please check your inbox.",
    );
    navigate("/");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050b18] text-white">
      <div className="w-full max-w-md rounded-xl bg-[#0b1424] p-8 shadow-lg">
        {/* Title */}
        <h1 className="mb-2 text-center text-2xl font-bold text-cyan-400">
          LabTrack
        </h1>
        <p className="mb-6 text-center text-sm text-gray-400">
          Collaborative Programming Platform
        </p>

        {/* Tabs */}
        {!showForgotPassword && (
          <div className="mb-6 flex rounded-lg bg-[#0f1b33] p-1">
            <button
              type="button"
              onClick={() => {
                setActiveTab("signin");
                setErrors({});
                setSuccessMessage("");
              }}
              className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
                activeTab === "signin"
                  ? "bg-cyan-500 text-white"
                  : "text-gray-400"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("register");
                setErrors({});
                setSuccessMessage("");
              }}
              className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
                activeTab === "register"
                  ? "bg-cyan-500 text-white"
                  : "text-gray-400"
              }`}
            >
              Register
            </button>
          </div>
        )}
        {successMessage && (
          <p className="mb-4 rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-400">
            {successMessage}
          </p>
        )}

        {/* Form */}
        {showForgotPassword ? (
          <form className="space-y-4" onSubmit={handleForgotPassword}>
            <div>
              <p className="mb-2 text-sm text-gray-400">
                Enter your KFUPM email and we will send you a reset link.
              </p>
              <input
                type="text"
                placeholder="KFUPM Email"
                value={forgotPasswordEmail}
                onChange={(e) => setForgotPasswordEmail(e.target.value)}
                className="w-full rounded-md bg-[#0f1b33] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
              />
              {errors.forgotPasswordEmail && (
                <p className="mt-1 text-sm text-red-400">
                  {errors.forgotPasswordEmail}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full rounded-md bg-cyan-500 py-3 font-semibold hover:bg-cyan-600"
            >
              Send reset link
            </button>

            <button
              type="button"
              onClick={() => {
                setShowForgotPassword(false);
                setErrors({});
                setSuccessMessage("");
              }}
              className="w-full rounded-md border border-[#1d2b45] py-3 font-semibold text-gray-300 transition hover:border-cyan-500 hover:text-cyan-400"
            >
              Back to sign in
            </button>
          </form>
        ) : activeTab === "signin" ? (
          <form className="space-y-4" onSubmit={handleSignIn}>
            <div>
              <input
                type="text"
                placeholder="KFUPM Email"
                value={signInData.identifier}
                onChange={(e) =>
                  setSignInData({
                    ...signInData,
                    identifier: e.target.value,
                  })
                }
                className="w-full rounded-md bg-[#0f1b33] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
              />
              {errors.identifier && (
                <p className="mt-1 text-sm text-red-400">{errors.identifier}</p>
              )}
            </div>

            <div>
              <div className="relative">
                <input
                  type={showSignInPassword ? "text" : "password"}
                  placeholder="Password"
                  value={signInData.password}
                  onChange={(e) =>
                    setSignInData({ ...signInData, password: e.target.value })
                  }
                  className="w-full rounded-md bg-[#0f1b33] px-4 py-3 pr-12 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <button
                  type="button"
                  onClick={() => setShowSignInPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center px-4 text-xs font-semibold uppercase tracking-wide text-gray-400 transition hover:text-cyan-400"
                  aria-label={
                    showSignInPassword ? "Hide password" : "Show password"
                  }
                >
                  {showSignInPassword ? "Hide" : "Show"}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-sm text-red-400">{errors.password}</p>
              )}
            </div>

            <div className="flex items-center justify-between text-sm text-gray-400">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={signInData.rememberMe}
                  onChange={(e) =>
                    setSignInData({
                      ...signInData,
                      rememberMe: e.target.checked,
                    })
                  }
                />
                Remember me
              </label>
              <button
                type="button"
                onClick={() => {
                  setForgotPasswordEmail(signInData.identifier);
                  setShowForgotPassword(true);
                  setErrors({});
                  setSuccessMessage("");
                }}
                className="text-cyan-400 hover:underline"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              className="w-full rounded-md bg-cyan-500 py-3 font-semibold hover:bg-cyan-600"
            >
              Sign in
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div>
              <input
                type="text"
                placeholder="Full Name"
                value={registerData.fullName}
                onChange={(e) =>
                  setRegisterData({ ...registerData, fullName: e.target.value })
                }
                className="w-full rounded-md bg-[#0f1b33] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
              />
              {errors.fullName && (
                <p className="mt-1 text-sm text-red-400">{errors.fullName}</p>
              )}
            </div>

            <div>
              <input
                type="text"
                placeholder="KFUPM Email"
                value={registerData.email}
                onChange={(e) =>
                  setRegisterData({ ...registerData, email: e.target.value })
                }
                className="w-full rounded-md bg-[#0f1b33] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-400">{errors.email}</p>
              )}
            </div>

            <div>
              <input
                type="password"
                placeholder="Password"
                value={registerData.password}
                onChange={(e) =>
                  setRegisterData({ ...registerData, password: e.target.value })
                }
                className="w-full rounded-md bg-[#0f1b33] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
              />
              {errors.registerPassword && (
                <p className="mt-1 text-sm text-red-400">
                  {errors.registerPassword}
                </p>
              )}
            </div>

            <div>
              <input
                type="password"
                placeholder="Confirm Password"
                value={registerData.confirmPassword}
                onChange={(e) =>
                  setRegisterData({
                    ...registerData,
                    confirmPassword: e.target.value,
                  })
                }
                className="w-full rounded-md bg-[#0f1b33] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-400">
                  {errors.confirmPassword}
                </p>
              )}
            </div>
            <div>
              <p className="mb-2 text-sm text-gray-400">Account Type</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setRegisterData({ ...registerData, role: "student" })
                  }
                  className={`flex-1 rounded-md py-2 text-sm ${
                    registerData.role === "student"
                      ? "bg-cyan-500 text-white"
                      : "bg-[#0f1b33] text-gray-400"
                  }`}
                >
                  Student
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setRegisterData({ ...registerData, role: "instructor" })
                  }
                  className={`flex-1 rounded-md py-2 text-sm ${
                    registerData.role === "instructor"
                      ? "bg-cyan-500 text-white"
                      : "bg-[#0f1b33] text-gray-400"
                  }`}
                >
                  Instructor
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setRegisterData({ ...registerData, role: "admin" })
                  }
                  className={`flex-1 rounded-md py-2 text-sm ${
                    registerData.role === "admin"
                      ? "bg-cyan-500 text-white"
                      : "bg-[#0f1b33] text-gray-400"
                  }`}
                >
                  Admin
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRegister}
              className="w-full rounded-md bg-cyan-500 py-3 font-semibold hover:bg-cyan-600"
            >
              Register
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default LoginPage;
