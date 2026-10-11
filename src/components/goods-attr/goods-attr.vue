<template>
	<view class="cu-modal bottom-modal" :class="{'show':isShow}" @click="hide">
	  <view class="cu-dialog">
			<view class="goods-data">
				<view class="thumb">
					<image :src="image" mode="aspectFill"></image>
				</view>
				<view class="item">
					<view class="title">
						<text></text>
					</view>
					<view class="price">
						<text class="min">￥</text>
						<text class="max">299</text>
						<text class="min">.00</text>
					</view>
					<view class="inventory">
						<text>库存：3000</text>
					</view>
				</view>
			</view>
			<view class="attr-size">
				<view class="attr-list" v-for="item in flatAttrList" :key="item.flatKey">
					<view class="title">
						<text>{{item.attr}}</text>
					</view>
					<view class="size-list">
						<div class="list" v-for="value in item.SizeList"
						:class="{'action': value.selected}"
						@click.stop="onAttrSize(item, value)" :key="value.size">
							<text>{{value.size}}</text>
						</div>
					</view>
				</view>
				<view class="attr-number" @click.stop="onStop">
					<view class="tit">数量</view>
					<view class="number">
						<text class="iconfont icon-jian"></text>
						<input type="tel" value="1" maxlength="8">
						<text class="iconfont icon-jia"></text>
					</view>
				</view>
			</view>
			<view class="attr-btn">
				<view class="add-cart" v-if="BuyType === 1" @click="onConfirm(BuyType)">加入购物车</view>
				<view class="add-buy" v-if="BuyType === 1" @click="onConfirm(BuyType)">立即购买</view>
				<view class="confirm" v-if="BuyType === 2 || BuyType === 3" @click="onConfirm(BuyType)">确定</view>
			</view>
		</view>
	</view>
</template>

<script>
	export default {
		props: {
			image: {
				type: String,
				default: '/static/logo.png',
			}
		},
		data() {
			return {
				isShow: false,
				AttrIndex: 0,
				SizeIndex: 0,
				AttrSizeList:[
					{
						attr: '颜色',
						SizeList: [
							{ size: '白色', selected: false },
							{ size: '黑色', selected: false },
							{ size: '粉丝', selected: false },
							{ size: '灰色', selected: false },
						],
					},{
						attr: '尺码',
						SizeList: [
							{ size: 'M尺码', selected: false },
							{ size: 'L尺码', selected: false },
							{ size: 'XL尺码', selected: false },
							{ size: 'XXL尺码', selected: false },
						],
					}
				],
				BuyType: 0,
			};
		},
		computed: {
			flatAttrList() {
				return this.AttrSizeList.map((attrGroup, groupIndex) => ({
					...attrGroup,
					flatKey: `attr-${groupIndex}`,
				}));
			}
		},
		methods:{
			show(type){
				this.BuyType = type;
				this.isShow = true;
			},
			hide(){
				this.isShow = false;
			},
			onStop(){

			},
			onAttrSize(attrGroup, value){
				// 同组内取消其他选中
				attrGroup.SizeList.forEach(s => s.selected = false);
				value.selected = true;
				this.AttrIndex = this.AttrSizeList.indexOf(attrGroup);
				this.SizeIndex = attrGroup.SizeList.indexOf(value);
			},
			onConfirm(type){
				uni.navigateTo({
					url: '/pages/ConfirmOrder/ConfirmOrder'
				})
			}
		}
	}
</script>

<style scoped lang="scss">
	@import 'goods-attr.scss';
</style>
