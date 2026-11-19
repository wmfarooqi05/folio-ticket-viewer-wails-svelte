<script lang="ts">
  import { onMount } from 'svelte';
  import { Events } from '@wailsio/runtime';
  import { FileService } from '../bindings/shellproto';

  let root = $state('');
  let files: { path: string; size: number; mtime: number }[] = $state([]);
  let log: string[] = $state([]);
  let ms = $state(0);

  async function load(r: string) {
    root = r;
    const t = performance.now();
    files = await FileService.ListMarkdown(r);
    ms = Math.round(performance.now() - t);
    await FileService.Watch(r); FileService.LogUI('rendered ' + files.length + ' files');
  }
  async function pick() {
    const r = await FileService.PickFolder();
    if (r) await load(r);
  }
  onMount(async () => {
    Events.On('file:changed', (e: any) => {
      FileService.LogUI('received file:changed ' + e.data); log = [`${new Date().toLocaleTimeString()} ${e.data}`, ...log].slice(0, 50);
    });
    const r = await FileService.InitialRoot();
    if (r) await load(r);
  });
</script>

<main class="p-4 font-sans text-sm bg-slate-900 text-slate-100 h-screen flex flex-col gap-2">
  <div class="flex items-center gap-3">
    <button class="rounded bg-emerald-600 px-3 py-1 hover:bg-emerald-500" onclick={pick}>Pick folder</button>
    <span class="text-slate-400 truncate">{root}</span>
    <span class="ml-auto font-bold">{files.length} files ({ms} ms round trip)</span>
  </div>
  <div class="flex gap-3 min-h-0 flex-1">
    <ul class="flex-1 overflow-auto font-mono text-xs">
      {#each files as f (f.path)}
        <li class="whitespace-nowrap">{new Date(f.mtime).toISOString().slice(0, 19)} {f.path}</li>
      {/each}
    </ul>
    <div class="w-72 overflow-auto font-mono text-xs border-l border-slate-700 pl-2">
      <div class="font-bold">Change log</div>
      {#each log as l}<div>{l}</div>{/each}
    </div>
  </div>
</main>
