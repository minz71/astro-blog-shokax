import { setSidebarOpen } from "@/stores/sidebarSignal";

function SidebarOverlay() {
  return (
    <button
      type="button"
      class="sidebar-overlay"
      onclick={() => setSidebarOpen(false)}
      aria-label="Close sidebar"
    ></button>
  );
}

export default SidebarOverlay;
