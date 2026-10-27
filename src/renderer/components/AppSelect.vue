<script setup lang="ts" generic="Value extends string | number">
import { computed, nextTick, onMounted, onUnmounted, ref, useId } from 'vue';
import type { CSSProperties } from 'vue';
import { Check, ChevronDown } from '@lucide/vue';

const props = defineProps<{
  modelValue: Value;
  options: { value: Value; label: string }[];
  label: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: Value] }>();
const id = useId();
const trigger = ref<HTMLButtonElement>();
const menu = ref<HTMLElement>();
const opened = ref(false);
const activeIndex = ref(0);
const menuStyle = ref<CSSProperties>({});
const selectedIndex = computed(() =>
  props.options.findIndex((option) => option.value === props.modelValue),
);
const selectedLabel = computed(() => props.options[selectedIndex.value]?.label ?? '请选择');

async function openMenu() {
  if (!props.options.length || !trigger.value) return;
  const bounds = trigger.value.getBoundingClientRect();
  const gap = 6;
  const margin = 8;
  const menuHeight = props.options.length * 34 + 12;
  const below = window.innerHeight - bounds.bottom - gap - margin;
  const above = bounds.top - gap - margin;
  const upwards = below < menuHeight && above > below;
  const width = Math.min(Math.max(bounds.width, 132), window.innerWidth - margin * 2);
  menuStyle.value = {
    width: `${width}px`,
    left: `${Math.max(margin, Math.min(bounds.right - width, window.innerWidth - width - margin))}px`,
    maxHeight: `${Math.max(0, upwards ? above : below)}px`,
    ...(upwards
      ? { bottom: `${window.innerHeight - bounds.top + gap}px` }
      : { top: `${bounds.bottom + gap}px` }),
  };
  activeIndex.value = Math.max(0, selectedIndex.value);
  opened.value = true;
  await nextTick();
  scrollToActive();
}

function closeMenu() {
  opened.value = false;
}

function scrollToActive() {
  menu.value?.children[activeIndex.value]?.scrollIntoView({ block: 'nearest' });
}

function selectOption(index: number) {
  const option = props.options[index];
  if (option) emit('update:modelValue', option.value);
  closeMenu();
  trigger.value?.focus();
}

async function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Tab') {
    closeMenu();
    return;
  }
  if (event.key === 'Escape') {
    if (opened.value) {
      event.stopPropagation();
      closeMenu();
    }
    return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  if (!opened.value) {
    await openMenu();
    if (event.key !== 'Home' && event.key !== 'End') return;
  } else if (event.key === 'Enter' || event.key === ' ') {
    selectOption(activeIndex.value);
    return;
  }
  if (event.key === 'Home') activeIndex.value = 0;
  else if (event.key === 'End') activeIndex.value = props.options.length - 1;
  else {
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    activeIndex.value =
      (activeIndex.value + direction + props.options.length) % props.options.length;
  }
  scrollToActive();
}

function onPointerdown(event: PointerEvent) {
  const target = event.target as Node;
  if (!trigger.value?.contains(target) && !menu.value?.contains(target)) closeMenu();
}

function onScroll(event: Event) {
  if (!menu.value?.contains(event.target as Node)) closeMenu();
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerdown);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', closeMenu);
});
onUnmounted(() => {
  document.removeEventListener('pointerdown', onPointerdown);
  document.removeEventListener('scroll', onScroll, true);
  window.removeEventListener('resize', closeMenu);
});
</script>

<template>
  <button
    :id="id"
    ref="trigger"
    type="button"
    class="app-select-trigger"
    :class="{ 'is-open': opened }"
    role="combobox"
    :aria-label="label"
    aria-haspopup="listbox"
    :aria-expanded="opened"
    :aria-controls="opened ? `${id}-listbox` : undefined"
    :aria-activedescendant="opened ? `${id}-option-${activeIndex}` : undefined"
    @click.stop="opened ? closeMenu() : openMenu()"
    @keydown="onKeydown"
    @blur="closeMenu"
  >
    {{ selectedLabel }}
    <ChevronDown :size="14" aria-hidden="true" />
  </button>
  <Teleport to="body">
    <div
      v-if="opened"
      :id="`${id}-listbox`"
      ref="menu"
      class="app-select-menu"
      role="listbox"
      :aria-label="label"
      :style="menuStyle"
      @pointerdown.prevent
      @click.stop
    >
      <div
        v-for="(option, index) in options"
        :id="`${id}-option-${index}`"
        :key="option.value"
        class="app-select-option"
        :class="{ 'is-selected': option.value === modelValue, 'is-active': index === activeIndex }"
        role="option"
        :aria-selected="option.value === modelValue"
        @pointermove="activeIndex = index"
        @click="selectOption(index)"
      >
        {{ option.label }}
        <Check v-if="option.value === modelValue" :size="14" aria-hidden="true" />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.app-select-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  gap: 16px;
  min-width: 96px;
  min-height: 33px;
  padding: 7px 12px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font-size: 11px;
  line-height: 17px;
  white-space: nowrap;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.app-select-trigger:hover,
.app-select-trigger.is-open {
  border-color: var(--green);
  background: var(--hover);
}
.app-select-trigger > svg {
  color: var(--muted);
  transition: transform 0.15s;
}
.app-select-trigger.is-open > svg {
  transform: rotate(180deg);
}
.app-select-menu {
  position: fixed;
  z-index: 200;
  overflow-y: auto;
  padding: 5px;
  border: 1px solid var(--control-border);
  border-radius: 9px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 10px 35px #25372220;
}
.app-select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 34px;
  padding: 8px 10px;
  border-radius: 5px;
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
  cursor: pointer;
}
.app-select-option.is-active {
  background: var(--hover);
}
.app-select-option.is-selected {
  color: var(--green);
  background: var(--green-soft);
}
</style>
