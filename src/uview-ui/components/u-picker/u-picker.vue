<template><view class="u-picker" @click="$emit('confirm', [{ label: '默认', value: 'default' }])"><slot>选择器</slot></view></template>
<script setup>
defineProps({ value: Boolean, list: Array });
defineEmits(['confirm','cancel','columnChange','input']);
</script>
