<template><image :src="src" :mode="mode || 'aspectFill'" class="u-image" @click="$emit('click', $event)" /></template>
<script setup>
defineProps({ src: String, mode: String, width: [String,Number], height: [String,Number] });
defineEmits(['click']);
</script>
<style scoped>.u-image{max-width:100%;}</style>
