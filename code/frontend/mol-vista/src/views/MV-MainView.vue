<!-- Copyright (c) 2026. All rights reserved. -->
<!-- This source code is licensed under the CC BY-NC-SA -->
<!-- (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao. -->
<!-- This software is protected by copyright law. Reproduction, distribution, or use for commercial -->
<!-- purposes is prohibited without the author's permission. If you have any questions or require -->
<!-- permission, please contact the author: edocsitahw@qq.com -->

<template>

    <div class="mv-main-view">

        <mv-app-top-bar/>

        <div class="mmv-workspace">

            <mv-app-structure-panel />

            <mv-molecule-viewer :source="source" />

            <mv-app-inspector />

        </div>

        <mv-app-status-bar />

    </div>

</template>

<script setup lang='ts'>
/**
 * @file MV-MainView.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/17 20:00
 * @desc
 * @copyright CC BY-NC-SA
 * */
import MvAppStructurePanel from "@/components/layout/MV-AppStructurePanel.vue";
import MvMoleculeViewer from "@/components/layout/MV-MoleculeViewer.vue";
import MvAppInspector from "@/components/layout/MV-AppInspector.vue";
import MvAppStatusBar from "@/components/layout/MV-AppStatusBar.vue";
import MvAppTopBar from "@/components/layout/MV-AppTopBar.vue";

</script>

<style lang='sass' scoped>

</style>
