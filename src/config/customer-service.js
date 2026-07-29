import config from '@/config/config';

export default {
  activeProvider: 'official-account',
  officialAccount: {
    enabled: true,
    cloudFunction: 'babychat',
  },
  enterpriseWeChat: {
    enabled: false,
    corpId: config.wecomCorpId,
    extInfo: config.wecomExtInfo,
  },
};
