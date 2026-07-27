<script lang="ts">
  import { toggleSidebar } from "../../stores/sidebarStore";
</script>

<div
  class="fixed inset-0 bg-black/50 z-[var(--z-sidebar-overlay)] cursor-pointer lg:hidden [animation:fadeIn_0.3s_ease]"
  onclick={toggleSidebar}
  role="button"
  tabindex="0"
  onkeydown={(e) => {
    if (e.key === "Enter" || e.key === " ") toggleSidebar();
  }}
  aria-label="Close sidebar"
></div>

<style>
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
