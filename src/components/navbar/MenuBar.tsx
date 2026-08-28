import { For } from "solid-js";

import type { NavItemType } from "./NavTypes";
import DropBox from "./DropBox.tsx";
import NavLinkItem from "./NavLinkItem.tsx";
import { currentLocale, getT } from "@/i18n";

const t = getT(currentLocale);

/**
 * 不要在这里加 UnoCSS 的 display 工具类（inline-block 等）。
 *
 * .desktop-only（navbar.css）在 <1024px 时 display: none、>=1024px 时
 * inline-block，两种状态它自己都管了。同一元素再挂一个 inline-block 工具类，
 * 特异度相同而 UnoCSS 的输出排在 navbar.css 之后，工具类就永远赢——
 * 手机版的隐藏失效，导航项被挤成逐字竖排。
 */
const DESKTOP_NAV_LINK =
  "desktop-only before:rounded-0.5 before:bg-current before:content-empty before:absolute before:bottom-0 before:left-50% before:transform-translate-x--50% before:transition-all before:transition-duration-400 before:transition-ease-in-out before:h-0.75 before:w-0 hover:before:w-60%";

interface MenuBarProps {
  navLinks?: NavItemType[];
  name: string;
}

function MenuBar(props: MenuBarProps) {
  const navLinks = () => props.navLinks ?? [];

  return (
    <ul class="m-0 pb-2.5 pt-2.5 p-is-0 flex w-full">
      <NavLinkItem
        class="menu-title"
        href="/"
        text={props.name}
        ariaLabel={`${props.name} ${t("nav.home")}`}
      />
      <For each={navLinks()} fallback={null}>
        {(item) =>
          item.dropbox?.enable ? (
            <DropBox
              navLinks={item.dropbox?.items ?? []}
              icon={item.icon}
              rootText={item.text}
              class="desktop-only"
            />
          ) : (
            <NavLinkItem
              href={item.href}
              text={item.text}
              icon={item.icon}
              class={DESKTOP_NAV_LINK}
            />
          )
        }
      </For>
    </ul>
  );
}

export default MenuBar;
