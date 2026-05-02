import SideBar from "./SideBar";
import TopBar from "./TopBar";

function DashboardLayout({ children }) {
  return (
    <div className="flex h-screen bg-[#0b1220] text-white">
      {/* Sidebar */}
      <SideBar />

      {/* Main area */}
      <div className="flex flex-col flex-1">
        <TopBar />

        {/* Content */}
        <main className="flex-1 p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;