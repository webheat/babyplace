<template><view class="u-empty">{{ text || '暂无数据' }}</view></template>
<script setup>
defineProps({ text: String, mode: String });
</script>
