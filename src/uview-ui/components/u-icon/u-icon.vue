<template><view class="u-icon" @click="$emit('click', $event)">{{ name || '' }}</view></template>
<script setup>
defineProps({ name: String, size: [String,Number], color: String, label: String });
defineEmits(['click']);
</script>
