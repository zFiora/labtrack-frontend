import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { clearCurrentUser, getCurrentUser } from "../../utils/authStorage.js";

function formatRole(role) {
  if (!role) return "";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function TopBar({ title = ""}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const currentUser = getCurrentUser() || {};
  const accountLabel = [
    formatRole(currentUser.role),
    currentUser.department,
  ].filter(Boolean).join(" · ");

  const handleLogout = () => {
    clearCurrentUser();
    navigate("/");
  };

  const initial = currentUser.fullName
    ? currentUser.fullName.charAt(0).toUpperCase()
    : "U";

  return (
    <header className="flex h-16 items-center justify-between border-b-2 border-cyan-400 bg-[#0b1220] px-6">
      <div className="min-w-0">
        {title ? (
          <div className="truncate text-sm font-semibold text-slate-100">
            {title}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-4 relative">
        {accountLabel ? (
          <div className="rounded-full bg-[#1e293b] px-5 py-2 text-sm font-semibold text-cyan-400">
            {accountLabel}
          </div>
        ) : null}

        {/* Profile Circle */}
        <div
          onClick={() => setOpen(!open)}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-cyan-400 font-bold text-[#0b1220]"
        >
          {initial}
        </div>

        {/* Dropdown */}
        {open && (
          <div className="absolute right-0 top-14 w-40 rounded-xl bg-[#1a2238] shadow-lg">
            <button
              onClick={handleLogout}
              className="w-full px-4 py-3 text-left text-sm text-white hover:bg-[#2a3555]"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export default TopBar;
