<script lang='ts'>
  import type { TocItem } from './SidebarTypes'
  import { onMount } from 'svelte'

  interface Props {
    toc?: TocItem[]
    isActive?: boolean
  }

  const { toc = [], isActive = false }: Props = $props()

  // Distance kept between the viewport top and the target heading, so it clears
  // the 50px fixed navbar. Also used as the line that decides the active item.
  const HEADING_OFFSET = 100

  let activeIndex = $state(0)
  let currentItems = $state(new Set<number>())
  let containerElement: HTMLElement | null = $state(null)

  // Helper function to render nested TOC items
  function getTocItemClass(index: number): string {
    const classes = ['toc-item']
    if (currentItems.has(index)) {
      classes.push('current')
    }
    if (activeIndex === index) {
      classes.push('active')
    }
    return classes.join(' ')
  }

  function handleTocClick(event: MouseEvent, id: string, index: number) {
    event.preventDefault()
    const target = document.getElementById(id)
    if (target) {
      // offsetTop is relative to the nearest positioned ancestor (the article
      // wrapper), not the document, so it must be resolved against the page.
      const scrollTop = target.getBoundingClientRect().top + window.scrollY - HEADING_OFFSET
      window.scrollTo({
        top: scrollTop,
        behavior: 'smooth',
      })
      activeIndex = index
    }
  }

  onMount(() => {
    if (typeof window === 'undefined' || toc.length === 0)
      return

    // Headings that actually exist in the DOM, each paired with its index in
    // `toc` so a missing heading cannot shift the highlight onto a neighbour.
    const sections: { index: number, element: HTMLElement }[] = []
    toc.forEach((item, index) => {
      const element = document.getElementById(item.id)
      if (element)
        sections.push({ index, element })
    })

    if (sections.length === 0)
      return

    const activateNavByIndex = (index: number): void => {
      if (index < 0 || index >= toc.length)
        return

      activeIndex = index
      currentItems = new Set([index])

      // Update parent items
      let currentToc = toc[index]
      for (let i = index - 1; i >= 0; i--) {
        if (toc[i].level < currentToc.level) {
          currentItems.add(i)
          currentToc = toc[i]
        }
      }

      // Scroll TOC into view if needed
      if (isActive && containerElement) {
        const activeElement = containerElement.querySelector('.toc-item.active') as HTMLElement
        if (activeElement) {
          const offsetTop = activeElement.offsetTop - containerElement.clientHeight / 4
          containerElement.scrollTo({
            top: offsetTop,
            behavior: 'smooth',
          })
        }
      }
    }

    // The last heading whose top has reached the HEADING_OFFSET line, i.e. the
    // one handleTocClick parks at the top of the viewport. The 2px slack keeps
    // a sub-pixel scroll landing from reading as "not there yet".
    const findIndex = (): number => {
      let index = sections[0].index
      for (const section of sections) {
        if (section.element.getBoundingClientRect().top - HEADING_OFFSET > 2)
          break
        index = section.index
      }
      return index
    }

    // Measured on scroll rather than through an IntersectionObserver: a heading
    // that stops exactly on the line never crosses it, so an observer would
    // leave the highlight one item behind after a TOC click.
    let lastIndex = -1
    let ticking = false

    const update = (): void => {
      const index = findIndex()
      if (index === lastIndex)
        return
      lastIndex = index
      activateNavByIndex(index)
    }

    const onScroll = (): void => {
      if (ticking)
        return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        update()
      })
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  })
</script>

<div class='contents' bind:this={containerElement}>
  {#if toc.length > 0}
    <ol class='toc'>
      {#each toc as item, index (item.id)}
        <li
          class={getTocItemClass(index)}
          style={`padding-left: ${(item.level - 1) * 0.75}rem`}
        >
          <a
            href={`#${item.id}`}
            class='toc-link'
            onclick={e => handleTocClick(e, item.id, index)}
          >
            {item.text}
          </a>
          {#if item.children && item.children.length > 0}
            <ol class='toc-child'>
              {#each item.children as child}
                <li class='toc-item'>
                  <a href={`#${child.id}`} class='toc-link'>
                    {child.text}
                  </a>
                </li>
              {/each}
            </ol>
          {/if}
        </li>
      {/each}
    </ol>
  {:else}
    <p class='no-toc'>No contents available</p>
  {/if}
</div>

<style>
  .contents ol {
    padding: 0 0.125rem 0.3125rem 0.625rem;
    text-align: left;
    list-style: none;
    margin: 0;
  }

  .contents .toc-item {
    font-size: 0.875rem;
    line-height: 1.8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .contents .toc-child {
    display: none;
  }

  .contents .active > .toc-child {
    display: block;
  }

  .contents .current > .toc-child {
    display: block;
  }

  .contents .current > .toc-child > .toc-item {
    display: block;
  }

  .contents .active > a {
    color: var(--primary-color);
  }

  .contents .current > a {
    color: var(--primary-color);
  }

  .contents .current > a:hover {
    color: var(--primary-color);
  }

  .contents .toc-link {
    color: inherit;
    text-decoration: none;
    display: block;
    transition: color 0.2s ease;
  }

  .contents .toc-link:hover {
    color: var(--primary-color);
  }

  .no-toc {
    color: var(--grey-5);
    text-align: center;
    font-size: 0.875rem;
  }
</style>
