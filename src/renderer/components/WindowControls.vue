<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
const desktop = globalThis.window.desktop;
const maximized = ref(false);
let dispose: (() => void) | undefined;

onMounted(async () => {
  if (!desktop) return;
  try {
    if (typeof desktop.window.isMaximized === 'function')
      maximized.value = await desktop.window.isMaximized();
  } catch {
    maximized.value = false;
  }
  try {
    if (typeof desktop.window.onMaximized === 'function')
      dispose = desktop.window.onMaximized((value) => {
        maximized.value = value;
      });
  } catch {
    // 旧版预加载脚本没有这个能力，退回点击时的乐观切换
  }
});
onUnmounted(() => dispose?.());

function toggleMaximize() {
  // 主进程事件是权威来源，这里先切换给自己即时反馈
  maximized.value = !maximized.value;
  desktop?.window.maximize();
}
</script>

<template>
  <div class="window-controls">
    <button aria-label="最小化" title="最小化" @click="desktop?.window.minimize()">
      <svg class="window-glyph" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3.5 8.5h9" />
      </svg></button
    ><button
      :aria-label="maximized ? '还原窗口' : '最大化'"
      :title="maximized ? '向下还原' : '最大化'"
      @click="toggleMaximize"
    >
      <svg v-if="maximized" class="window-glyph" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M5.5 3.5h7v7" />
        <rect x="3.5" y="5.5" width="7" height="7" />
      </svg>
      <svg v-else class="window-glyph" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="3.5" y="3.5" width="9" height="9" />
      </svg></button
    ><button aria-label="关闭窗口" title="关闭" @click="desktop?.window.close()">
      <svg class="window-glyph" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
      </svg>
    </button>
  </div>
</template>
