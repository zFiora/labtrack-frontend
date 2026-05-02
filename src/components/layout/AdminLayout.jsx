import AdminSideBar from "./AdminSideBar";
import TopBar from "./TopBar";

function AdminLayout({ children }) {
  return (
    <div className="flex h-screen bg-[#0b1220] text-white">
      <AdminSideBar />
      <div className="flex flex-col flex-1">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;
