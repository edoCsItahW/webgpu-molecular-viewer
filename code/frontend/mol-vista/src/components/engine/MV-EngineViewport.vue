<!-- Copyright (c) 2026. All rights reserved. -->
<!-- This source code is licensed under the CC BY-NC-SA -->
<!-- (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao. -->
<!-- This software is protected by copyright law. Reproduction, distribution, or use for commercial -->
<!-- purposes is prohibited without the author's permission. If you have any questions or require -->
<!-- permission, please contact the author: edocsitahw@qq.com -->

<template>

    <div class="mv-engine-viewport">

        <canvas ref="canvasRef" class="mev-canvas" />

        <slot />

    </div>

</template>

<script setup lang='ts'>
/**
 * @file MV-EngineViewport.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 14:41
 * @desc
 * @copyright CC BY-NC-SA
 * */
import { ref, provide } from "vue";
import type {Optional} from "@/types";

// State
const canvasRef = ref<Optional<HTMLCanvasElement>>();


// Provide
provide('engine', {  });

defineExpose({});
</script>

<style lang='sass' scoped>

</style>
