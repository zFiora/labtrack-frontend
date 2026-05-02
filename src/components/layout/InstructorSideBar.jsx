import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function InstructorSideBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [hoveredNav, setHoveredNav] = useState(null);

  const navItems = [
    {
      label: "Lab Management",
      icon: "🧪",
      path: "/instructor/labs",
      matchPaths: ["/instructor/labs"],
    },
    {
      label: "Courses",
      icon: "📚",
      path: "/instructor/courses",
      matchPaths: ["/instructor/courses"],
    },
    { label: "Students", icon: "👥", path: "/instructor/students", disabled: true },
    { label: "Analytics", icon: "📊", path: "/instructor/analytics" },
    { label: "Settings", icon: "⚙️", path: "/instructor/settings", disabled: true },
  ];

  const border = "#1a2540";
  const accent = "#22d3ee";
  const muted = "#8898b3";
  const dimmed = "#4a5568";

  return (
    <aside
      style={{
        width: 264,
        minWidth: 264,
        background:
          "linear-gradient(180deg, rgba(8,15,30,1) 0%, rgba(11,20,36,1) 100%)",
        borderRight: `1px solid ${border}`,
        display: "flex",
        flexDirection: "column",
        boxShadow: "inset -1px 0 0 rgba(255,255,255,0.02)",
      }}
    >
      <div
        style={{
          padding: "20px 24px 18px",
          borderBottom: `1px solid ${border}`,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: dimmed,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          Instructor
        </span>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>
            LabTrack
          </div>
        </div>
      </div>

      <nav
        style={{ padding: "16px 14px", flex: 1 }}
        onMouseLeave={() => setHoveredNav(null)}
      >
        {navItems.map((item) => {
          const matchedPaths = item.matchPaths ?? [item.path];
          const isActive = !item.disabled && matchedPaths.some(
            (path) =>
              location.pathname === path ||
              location.pathname.startsWith(`${path}/`),
          );
          const isHighlighted = isActive || hoveredNav === item.label;
          const labelColor = item.disabled ? dimmed : isHighlighted ? "#e2e8f0" : muted;

          return (
            <button
              key={item.label}
              onClick={() => !item.disabled && navigate(item.path)}
              onMouseEnter={() => !item.disabled && setHoveredNav(item.label)}
              onMouseLeave={() => setHoveredNav(null)}
              title={item.disabled ? "Coming soon" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                marginBottom: 6,
                padding: "12px 14px",
                background: isHighlighted ? "#10213f" : "transparent",
                border: `1px solid ${isHighlighted ? "#1e3a5f" : "transparent"}`,
                borderRadius: 14,
                color: labelColor,
                fontSize: 14,
                fontWeight: 600,
                cursor: item.disabled ? "not-allowed" : "pointer",
                textAlign: "left",
                transition: "all 0.2s ease",
                opacity: item.disabled ? 0.5 : 1,
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 10,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: isHighlighted
                    ? "rgba(34,211,238,0.12)"
                    : "#0d172b",
                  boxShadow: isActive ? `inset 0 0 0 1px ${accent}` : "none",
                  fontSize: 15,
                }}
              >
                {item.icon}
              </span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.disabled && (
                <span style={{ fontSize: 9, color: dimmed, letterSpacing: "0.05em" }}>
                  SOON
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
