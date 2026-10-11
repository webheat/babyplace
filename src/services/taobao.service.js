/**
 * 美团/饿了么商品业务映射服务
 * 将 POI 数据映射为电商商品格式
 */

/**
 * 将 POI 映射为商品记录
 */
export function mapGoodsItem(item = {}) {
  return {
    itemId: item._id,
    title: item.name || '未命名商品',
    pictUrl: item.cover || item.image || '/static/logo.png',
    itemDescription: item.address || item.summary || '',
    zkFinalPrice: '0',
    reservePrice: '0',
    couponAmount: '0',
    clickUrl: '',
    miniProgramUrl: '',
    nick: 'babyplace',
    raw: item,
  };
}

/**
 * 将 POI 映射为店铺记录
 */
export function buildShopRecord(poi = {}) {
  return {
    shopInfo: {
      shopId: poi._id,
      shopName: poi.name,
      shopPower: Number(poi.avg_rating || 0) * 10,
      cateName: poi.category || '亲子地点',
      regionName: poi.district || poi.city || '',
      address: [poi.city, poi.district, poi.address].filter(Boolean).join(' '),
      bizHourDesc: poi.recommended_duration || '',
      pricePerson: 0,
      distanceToShow: poi.distance ? `${Math.round(Number(poi.distance))}m` : '',
    },
    dealDetail: {},
    dealBaseInfo: {
      defaultPic: poi.cover_image || '/static/logo.png',
      dealTitle: poi.summary || poi.recommend_reason || poi.name,
      finalPrice: 0,
      marketPrice: 0,
    },
    couponInfo: {
      miniProgramUrl: '',
    },
    poi,
  };
}
