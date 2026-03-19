<template><view :style="{ height: `${height || 0}${unit || 'rpx'}`, backgroundColor: bgColor || 'transparent' }"></view></template>
<script setup>
defineProps({ height: [Number,String], bgColor: String, unit: String });
</script>
