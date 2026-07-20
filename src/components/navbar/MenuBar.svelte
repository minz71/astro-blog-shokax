<script lang="ts">
  import type { NavItemType } from "./NavTypes";
  import DropBox from "./DropBox.svelte";
  import NavLinkItem from "./NavLinkItem.svelte";
  import { currentLocale, getT } from "@/i18n";

  const t = getT(currentLocale);

  interface Props {
    navLinks?: NavItemType[];
    name: string;
  }

  const { navLinks = [], name }: Props = $props();
</script>

<ul class="m-0 pb-2.5 pt-2.5 p-is-0 flex w-full">
  <NavLinkItem class="menu-title" href="/" text={name} ariaLabel={`${name} ${t("nav.home")}`} />
  {#each navLinks as { href, text, icon, dropbox } (href)}
    {#if !dropbox?.enable}
      <NavLinkItem
        {href}
        {text}
        {icon}
        class="desktop-only inline-block before:rounded-0.5 before:bg-current before:h-0.75 before:w-0 before:content-empty before:transform-translate-x--50% before:transition-all before:transition-duration-400 before:transition-ease-in-out before:bottom-0 before:left-50% before:absolute hover:before:w-60%"
      />
    {:else}
      <DropBox
        navLinks={dropbox?.items ?? []}
        {icon}
        rootText={text}
        class="desktop-only inline-block"
      />
    {/if}
  {/each}
</ul>

<style>
  :global(.menu-title) {
    display: block;
  }

  :global(.desktop-only) {
    display: none;
  }

  @media (min-width: 1024px) {
    :global(.menu-title) {
      display: inline-block;
    }

    :global(.desktop-only) {
      display: inline-block;
    }
  }
</style>
