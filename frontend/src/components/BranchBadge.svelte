<script lang="ts">
  // The branch a ticket is moving in (ticket 38, ticket 37 Q4). A long branch truncates in the middle
  // and keeps its last 12 characters: the tail tells branches apart ("…refund-email" vs "…refund-api").
  // The tail never shrinks; only the head does. If even the tail does not fit, it loses its start.
  import Icon from '../lib/icons/Icon.svelte'

  interface Props {
    branch: string
    /** the tooltip: the whole Branch line (worktree, uncommitted) when there is one */
    title?: string | null
  }
  let { branch, title = null }: Props = $props()

  const KEEP = 12
  const parts = $derived(branch.length > KEEP + 2 ? [branch.slice(0, -KEEP), branch.slice(-KEEP)] : null)
</script>

<span
  class="inline-flex h-19 max-w-full min-w-0 items-center gap-4 rounded-[5px] bg-chip px-6 font-mono text-[10.5px] text-fg2"
  title={title ?? branch}
>
  <Icon name="git-branch" size={9} />
  {#if parts}
    <!-- one flex item, so the badge's gap does not split the branch name -->
    <span class="flex min-w-0" aria-hidden="true"
      ><span class="min-w-0 truncate">{parts[0]}</span><span class="tail"><bdi>{parts[1]}</bdi></span></span
    >
  {:else}
    <span class="min-w-0 truncate" aria-hidden="true">{branch}</span>
  {/if}
  <span class="sr-only">branch {branch}</span>
</span>

<style>
  /* keeps its size while the head shrinks; past that, it cuts from the start (the ellipsis on the left) */
  .tail {
    flex-shrink: 0;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    direction: rtl;
    text-overflow: ellipsis;
  }
</style>
