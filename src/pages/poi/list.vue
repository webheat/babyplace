<template>
  <view class="page">
    <view class="toolbar">
      <input
        v-model="keyword"
        class="search"
        confirm-type="search"
        placeholder="搜索地点名称/地址"
        @confirm="onSearch"
      />
      <button class="button" size="mini" @click="onSearch">搜索</button>
    </view>

    <mescroll-uni
      ref="mescroll"
      :down="downOption"
      :up="upOption"
      @down="downCallback"
      @up="upCallback"
    >
      <view v-if="list.length" class="list">
        <poi-card v-for="item in list" :key="item._id" :poi="item" @click="goDetail" @map="openMap" />
      </view>
      <view v-else class="state">暂无数据</view>
    </mescroll-uni>

    <contact-fab />
  </view>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import PoiCard from '@/components/poi-card.vue';
import { listPoi } from '@/api/poi';
import { openPoiMap } from '@/utils/poi';
import ContactFab from '@/components/contact-fab.vue';

const keyword = ref('');
const list = ref([]);
const page = ref(1);
const hasMore = ref(true);
const mescroll = ref(null);

const downOption = {
  use: true,
  auto: true,
};

const upOption = {
  use: true,
  auto: true,
  page: {
    num: 0,
    size: 20,
  },
  noMoreSize: 4,
  empty: {
    use: true,
    tip: '~ 暂无地点 ~',
  },
};

function goDetail(item) {
  if (!item?._id) return;
  uni.navigateTo({ url: `/pages/life/shop/shop?id=${item._id}` });
}

function openMap(item) {
  openPoiMap(item);
}

async function doSearch(reset = true) {
  if (reset) {
    page.value = 1;
    hasMore.value = true;
    list.value = [];
  }

  try {
    const result = await listPoi({
      keyword: keyword.value,
      page: page.value,
      pageSize: 20,
    });
    if (result.code !== 0) {
      uni.showToast({ title: result.message || '加载失败', icon: 'none' });
      return;
    }
    const items = result.data?.list || [];
    if (reset) {
      list.value = items;
    } else {
      list.value.push(...items);
    }
    hasMore.value = items.length >= 20;
    if (reset && items.length === 0) {
      // empty handled by mescroll
    }
  } catch (error) {
    uni.showToast({ title: error?.message || '加载失败', icon: 'none' });
  }
}

function onSearch() {
  doSearch(true);
}

function downCallback(mescrollInstance) {
  page.value = 1;
  hasMore.value = true;
  doSearch(true).then(() => {
    mescrollInstance.endSuccess(0, hasMore.value);
  });
}

function upCallback(mescrollInstance) {
  page.value = mescrollInstance.num;
  doSearch(false).then(() => {
    const size = list.value.length;
    mescrollInstance.endSuccess(size, hasMore.value);
  });
}

onMounted(() => {
  // Auto load via mescroll upOption.auto: true
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx;
  background: #f8fafc;
}

.toolbar {
  display: flex;
  gap: 12rpx;
  margin-bottom: 18rpx;
}

.search {
  flex: 1;
  height: 76rpx;
  border-radius: 14rpx;
  border: 2rpx solid #dbe2ea;
  background: #fff;
  padding: 0 20rpx;
}

.button {
  margin: 0;
  border-radius: 12rpx;
  background: #2563eb;
  color: #fff;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
</style>
