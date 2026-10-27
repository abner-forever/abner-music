<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
const props = withDefaults(defineProps<{ artwork?: string; title?: string }>(), {
  artwork: 'forest',
  title: '',
});
const uid = useId().replace(/:/g, '');
const failed = ref(false);
watch(
  () => props.artwork,
  () => {
    failed.value = false;
  },
);
const isImage = computed(() => !failed.value && /^(data:|https?:|blob:)/.test(props.artwork));
const palettes: Record<string, string[]> = {
  sunset: ['#e9dbc6', '#d8a475', '#a3492c', '#e9b07a', '#9a5b3b'],
  forest: ['#d6dfcc', '#acb89b', '#405c49', '#d9d4ac', '#6f8262'],
  ocean: ['#d4e2df', '#94b5bd', '#3d6d80', '#f2e8c9', '#658e9d'],
  dusk: ['#efcfb9', '#dd9c7c', '#a65140', '#f3daa7', '#c77b5c'],
  rain: ['#d9d5c9', '#9faea6', '#4a665d', '#e2cfa8', '#758c7d'],
  space: ['#c9c5dc', '#9693b4', '#514e75', '#e7dcca', '#767391'],
};
const colors = computed(() => palettes[props.artwork] || palettes.forest);
</script>

<template>
  <div class="cover-art" :class="`art-${artwork}`" :aria-label="title || '专辑封面'" role="img">
    <img
      v-if="isImage"
      :src="artwork"
      alt=""
      loading="lazy"
      referrerpolicy="no-referrer"
      @error="failed = true"
    />
    <svg
      v-else
      viewBox="0 0 400 400"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient :id="`${uid}-sky`" x1="0" y1="0" x2="0.7" y2="1">
          <stop :stop-color="colors[0]" />
          <stop offset="1" :stop-color="colors[1]" />
        </linearGradient>
        <radialGradient :id="`${uid}-light`">
          <stop stop-color="#fffaf0" stop-opacity=".46" />
          <stop offset="1" stop-color="#fffaf0" stop-opacity="0" />
        </radialGradient>
        <filter :id="`${uid}-grain`">
          <feTurbulence
            type="fractalNoise"
            baseFrequency=".7"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer><feFuncA type="linear" slope=".12" /></feComponentTransfer>
          <feBlend in="SourceGraphic" mode="soft-light" />
        </filter>
      </defs>
      <g :filter="`url(#${uid}-grain)`">
        <rect width="400" height="400" :fill="`url(#${uid}-sky)`" />
        <circle cx="290" cy="100" r="160" :fill="`url(#${uid}-light)`" />
        <template v-if="artwork === 'sunset' || artwork === 'dusk'">
          <circle :cx="artwork === 'dusk' ? 260 : 200" cy="159" r="64" :fill="colors[3]" />
          <path d="M0 253 Q80 179 173 252 T400 223 V400H0Z" :fill="colors[4]" opacity=".56" />
          <path d="M0 315 Q110 202 247 280 T400 267 V400H0Z" :fill="colors[2]" opacity=".6" />
          <path d="M0 348 Q124 307 226 346 T400 314 V400H0Z" :fill="colors[2]" />
          <path
            d="M92 400 Q111 319 168 263 M113 347q-41-20-47-49q42 1 47 49m17-27q3-44 34-51q0 29-34 51"
            fill="none"
            :stroke="colors[0]"
            stroke-width="2.5"
            opacity=".6"
          />
        </template>
        <template v-else-if="artwork === 'forest' || artwork === 'rain'">
          <circle cx="275" cy="112" r="50" :fill="colors[3]" opacity=".85" />
          <path d="M0 244 100 140 190 236 285 165 400 254V400H0Z" :fill="colors[4]" opacity=".32" />
          <path d="M0 306 104 231 223 290 309 224 400 281V400H0Z" :fill="colors[2]" opacity=".4" />
          <path d="M0 369Q124 269 400 334V400H0Z" :fill="colors[2]" />
          <g :stroke="colors[2]" stroke-width="5" fill="none">
            <path d="M84 350V102m0 49-35 35m35-11 41 35m-41 13-45 39m45-17 56 35" />
            <path d="M333 348V183m0 30-23 27m23-6 25 25m-25-6-35 34" />
          </g>
          <g :fill="colors[2]">
            <path d="m84 76-53 135h107Z" opacity=".82" />
            <path d="m84 132-72 143h145Z" opacity=".9" />
            <path d="m333 162-41 115h83Z" opacity=".8" />
            <path d="m333 218-53 101h108Z" />
          </g>
          <path
            d="M177 400q-33-39 31-61t18-53"
            fill="none"
            :stroke="colors[0]"
            stroke-width="12"
            opacity=".48"
          />
        </template>
        <template v-else-if="artwork === 'ocean'">
          <circle cx="275" cy="108" r="43" :fill="colors[3]" />
          <path d="M0 221Q100 200 200 219T400 211V400H0Z" :fill="colors[4]" />
          <path d="M0 267Q94 244 200 265T400 251V400H0Z" :fill="colors[2]" opacity=".45" />
          <path d="M0 332Q104 290 250 328T400 316V400H0Z" :fill="colors[2]" opacity=".7" />
          <g fill="none" :stroke="colors[0]" opacity=".65">
            <path d="M29 247q57-15 117-1m114 44q62 13 111-2M44 348q51-13 113-1" />
            <path d="M191 178q13-13 26 0q12-13 25 0" stroke-width="3" />
          </g>
          <path d="M0 376Q100 339 179 400H0Z" :fill="colors[3]" />
        </template>
        <template v-else>
          <circle cx="223" cy="157" r="79" :fill="colors[3]" opacity=".9" />
          <circle cx="249" cy="133" r="77" :fill="colors[1]" />
          <g :fill="colors[3]">
            <circle cx="72" cy="90" r="2" />
            <circle cx="323" cy="75" r="2" />
            <circle cx="110" cy="173" r="1.5" />
            <circle cx="320" cy="207" r="2" />
            <circle cx="174" cy="56" r="1" />
          </g>
          <path d="m0 307 100-70 96 74 94-44 110 66v67H0Z" :fill="colors[4]" />
          <path d="m0 371 112-53 106 54 75-35 107 47v16H0Z" :fill="colors[2]" />
          <ellipse
            cx="190"
            cy="220"
            rx="147"
            ry="18"
            transform="rotate(-28 190 220)"
            fill="none"
            :stroke="colors[0]"
            opacity=".36"
          />
        </template>
      </g>
      <text
        x="28"
        y="39"
        :fill="colors[2]"
        opacity=".75"
        font-family="Georgia,serif"
        font-size="12"
        letter-spacing="3"
      >
        ABNER ORIGINALS
      </text>
      <text
        x="373"
        y="376"
        text-anchor="end"
        :fill="colors[0]"
        opacity=".7"
        font-family="Georgia,serif"
        font-size="10"
        letter-spacing="2"
      >
        SOUND &amp; STILLNESS
      </text>
    </svg>
  </div>
</template>
